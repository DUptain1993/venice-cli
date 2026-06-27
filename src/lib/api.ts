/**
 * Venice AI API Client
 */

import { requireApiKey, trackUsage } from './config.js';
import { startSpinner, stopSpinner } from './output.js';
import { getVersion } from './version.js';
import type { Message, ToolDefinition, Model } from '../types/index.js';

const VENICE_API = process.env.VENICE_API_BASE_URL || 'https://api.venice.ai/api/v1';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const DEFAULT_TIMEOUT_MS = 120000;

export class VeniceApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'VeniceApiError';
  }

  static fromResponse(status: number, body: string): VeniceApiError {
    try {
      const json = JSON.parse(body);
      const message = json.error?.message || json.message || body;
      const code = json.error?.code;
      return new VeniceApiError(message, status, code);
    } catch {
      return new VeniceApiError(body || `HTTP ${status}`, status);
    }
  }

  isRetryable(): boolean {
    if (!this.statusCode) return true;
    return this.statusCode >= 500 && this.statusCode < 600;
  }

  isAuthError(): boolean {
    return this.statusCode === 401 || this.statusCode === 403;
  }

  isRateLimited(): boolean {
    return this.statusCode === 429;
  }
}

function getHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${requireApiKey()}`,
    'Content-Type': 'application/json',
    'User-Agent': `venice-cli/${getVersion()}`,
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkOnline(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch('https://api.venice.ai/api/v1/models', {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

export async function apiRequest<T>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    stream?: boolean;
    retries?: number;
    showSpinner?: boolean;
    spinnerText?: string;
    timeoutMs?: number;
    additionalHeaders?: Record<string, string>;
  } = {}
): Promise<T> {
  const {
    method = 'GET',
    body,
    stream = false,
    retries = MAX_RETRIES,
    showSpinner = true,
    spinnerText = 'Processing...',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    additionalHeaders = {},
  } = options;

  let spinner = showSpinner && !stream ? startSpinner(spinnerText) : null;
  let lastError: VeniceApiError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${VENICE_API}${endpoint}`, {
        method,
        headers: { ...getHeaders(), ...additionalHeaders },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw VeniceApiError.fromResponse(response.status, errorBody);
      }

      if (spinner) {
        stopSpinner(true);
        spinner = null;
      }

      if (stream) {
        return response as unknown as T;
      }

      return await response.json() as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        if (spinner) stopSpinner(false, 'Request timed out');
        throw new Error(
          `Request timed out after ${timeoutMs / 1000} seconds.\n` +
          'The server may be overloaded. Please try again later.'
        );
      }

      if (error instanceof VeniceApiError) {
        lastError = error;

        if (error.isAuthError()) {
          if (spinner) stopSpinner(false, 'Authentication failed');
          throw new Error(
            'Authentication failed. Please check your API key.\n' +
            'Update with: venice config set api_key <your-key>'
          );
        }

        if (error.isRateLimited()) {
          if (spinner) spinner.text = `Rate limited, waiting... (attempt ${attempt + 1}/${retries + 1})`;
          await sleep(RETRY_DELAY_MS * (attempt + 1) * 2);
          continue;
        }

        if (error.isRetryable() && attempt < retries) {
          if (spinner) spinner.text = `Retrying... (attempt ${attempt + 2}/${retries + 1})`;
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
      } else if (error instanceof Error) {
        if (attempt < retries) {
          const online = await checkOnline();
          if (!online) {
            if (spinner) stopSpinner(false, 'Network error');
            throw new Error(
              'Unable to connect to Venice API.\n' +
              'Please check your internet connection.'
            );
          }
          if (spinner) spinner.text = `Connection error, retrying... (attempt ${attempt + 2}/${retries + 1})`;
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        lastError = new VeniceApiError(error.message);
      }

      if (spinner) stopSpinner(false);
      throw lastError || error;
    }
  }

  if (spinner) stopSpinner(false);
  throw lastError || new Error('Request failed after retries');
}

export async function chatCompletion(
  messages: Message[],
  options: {
    model?: string;
    tools?: ToolDefinition[];
    tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
    venice_parameters?: Record<string, unknown>;
    system?: string;
  } = {}
): Promise<{
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  finish_reason: string;
}> {
  const body: Record<string, unknown> = {
    model: options.model || 'kimi-k2-5',
    messages,
    stream: false,
  };

  if (options.tools?.length) {
    body.tools = options.tools;
    body.tool_choice = options.tool_choice || 'auto';
  }

  if (options.venice_parameters) {
    body.venice_parameters = options.venice_parameters;
  }

  const response = await apiRequest<{
    choices: Array<{
      message: { content: string; tool_calls?: any[] };
      finish_reason: string;
    }>;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  }>('/chat/completions', {
    method: 'POST',
    body,
    spinnerText: 'Thinking...',
  });

  const choice = response.choices?.[0];
  const usage = response.usage;

  if (usage) {
    trackUsage({
      command: 'chat',
      model: options.model || 'kimi-k2-5',
      ...usage,
    });
  }

  return {
    content: choice?.message?.content || '',
    tool_calls: choice?.message?.tool_calls,
    usage,
    finish_reason: choice?.finish_reason || 'stop',
  };
}

export async function* chatCompletionStream(
  messages: Message[],
  options: {
    model?: string;
    tools?: ToolDefinition[];
    tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
    venice_parameters?: Record<string, unknown>;
    additionalHeaders?: Record<string, string>;
  } = {}
): AsyncGenerator<{
  content?: string;
  tool_calls?: any[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  done: boolean;
}> {
  const body: Record<string, unknown> = {
    model: options.model || 'kimi-k2-5',
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };

  if (options.tools?.length) {
    body.tools = options.tools;
    body.tool_choice = options.tool_choice || 'auto';
  }

  if (options.venice_parameters) {
    body.venice_parameters = options.venice_parameters;
  }

  const response = await apiRequest<Response>('/chat/completions', {
    method: 'POST',
    body,
    stream: true,
    showSpinner: false,
    additionalHeaders: options.additionalHeaders,
  });

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let totalUsage: any = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            if (totalUsage) {
              trackUsage({
                command: 'chat',
                model: options.model || 'kimi-k2-5',
                ...totalUsage,
              });
            }
            yield { done: true, usage: totalUsage };
            return;
          }

          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta;

            if (json.usage) {
              totalUsage = json.usage;
            }

            if (delta?.content) {
              yield { content: delta.content, done: false };
            }

            if (delta?.tool_calls) {
              yield { tool_calls: delta.tool_calls, done: false };
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { done: true, usage: totalUsage };
}

export async function listModels(
  options: { showSpinner?: boolean } = {}
): Promise<Model[]> {
  const { showSpinner: showSpinnerOption = true } = options;
  const modelTypes = ['text', 'image'];
  const merged = new Map<string, Model>();

  const requests: Array<{ endpoint: string; requestedType?: string; showSpinner: boolean }> = [
    { endpoint: '/models', showSpinner: showSpinnerOption },
    ...modelTypes.map((type) => ({
      endpoint: `/models?type=${encodeURIComponent(type)}`,
      requestedType: type,
      showSpinner: false,
    })),
  ];

  for (const request of requests) {
    try {
      const response = await apiRequest<{ data: Model[] }>(request.endpoint, {
        method: 'GET',
        spinnerText: 'Fetching models...',
        showSpinner: request.showSpinner,
      });

      for (const model of response.data || []) {
        const normalized: Model = { ...model };
        if (
          request.requestedType &&
          (!normalized.type || normalized.type.toLowerCase() === 'text')
        ) {
          normalized.type = request.requestedType;
        }
        const key = normalized.id || JSON.stringify(normalized);
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, normalized);
          continue;
        }
        const existingType = (existing.type || '').toLowerCase();
        const normalizedType = (normalized.type || '').toLowerCase();
        if (existingType === 'text' && normalizedType && normalizedType !== 'text') {
          merged.set(key, normalized);
        }
      }
    } catch (error) {
      if (!request.requestedType) {
        throw error;
      }
    }
  }

  return Array.from(merged.values());
}
