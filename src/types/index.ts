/**
 * Venice CLI Type Definitions
 */

export interface VeniceConfig {
  api_key?: string;
  default_model?: string;
  default_image_model?: string;
  default_voice?: string;
  output_format?: OutputFormat;
  no_color?: boolean;
  show_usage?: boolean;
  auto_approve?: boolean;
  max_context_tokens?: number;
  shell?: string;
}

export type OutputFormat = 'pretty' | 'json' | 'markdown' | 'raw';

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ChatCompletionOptions {
  model?: string;
  stream?: boolean;
  system?: string;
  format?: OutputFormat;
  character?: string;
  tools?: string[];
  continue?: boolean;
}

export interface ConversationEntry {
  id: string;
  timestamp: string;
  messages: Message[];
  model: string;
  character?: string;
}

export interface UsageRecord {
  timestamp: string;
  command: string;
  model: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface Model {
  id: string;
  type?: string;
  model_spec?: {
    description?: string;
    capabilities?: {
      privacy?: boolean;
    };
  };
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
}
