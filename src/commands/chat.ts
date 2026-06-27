/**
 * Chat Command - Interactive chat with AI models
 */

import { Command } from 'commander';
import { randomUUID } from 'crypto';
import {
  chatCompletion,
  chatCompletionStream,
} from '../lib/api.js';
import {
  getDefaultModel,
  getMaxContextTokens,
  getAutoApprove,
  addConversation,
  getLastConversation,
} from '../lib/config.js';
import {
  getToolDefinitions,
  getAgentToolDefinitions,
  executeTool,
  formatToolsHelp,
} from '../lib/tools.js';
import {
  buildCodebaseContext,
  formatContextAsSystemMessage,
  buildFileContext,
} from '../lib/context.js';
import {
  formatUsage,
  formatError,
  getChalk,
  startSpinner,
  clearSpinner,
  detectOutputFormat,
  isPiped,
} from '../lib/output.js';
import type { Message, OutputFormat, ToolCall } from '../types/index.js';

export function registerChatCommand(program: Command): void {
  program
    .command('chat [prompt...]')
    .description('Chat with an AI model')
    .option('-m, --model <model>', 'Model to use')
    .option('-s, --system <prompt>', 'System prompt')
    .option('-c, --character <name>', 'Character/persona to use')
    .option('-t, --tools <tools>', 'Comma-separated list of tools to enable')
    .option('--interactive-tools', 'Require approval for each tool call')
    .option('--continue', 'Continue the last conversation')
    .option('--no-stream', 'Disable streaming output')
    .option('--web-search', 'Enable web search for current information')
    .option('--no-thinking', 'Disable reasoning/thinking on reasoning models')
    .option('--strip-thinking', 'Strip thinking blocks from response')
    .option('--no-venice-prompt', 'Disable Venice system prompts')
    .option('--search-results-in-stream', 'Include search results in stream')
    .option('-f, --format <format>', 'Output format (pretty|json|markdown|raw)')
    .option('--list-tools', 'List available tools')
    .option('--file <paths...>', 'Load specific files into context')
    .option('--codebase [dir]', 'Load entire codebase into context')
    .option('--codebase-tokens <n>', 'Token budget for codebase context')
    .option('--agent', 'Enable agent mode with file and shell tools')
    .option('--auto-approve', 'Auto-approve all tool calls without prompting')
    .action(async (promptParts: string[], options) => {
      const c = getChalk();

      if (options.listTools) {
        console.log(formatToolsHelp());
        return;
      }

      let prompt = promptParts.join(' ');

      if (!prompt && !process.stdin.isTTY) {
        prompt = await readStdin();
      }

      if (!prompt) {
        console.error(formatError('No prompt provided. Usage: venice chat "Your message"'));
        process.exit(1);
      }

      const model = options.model || getDefaultModel();
      const format = detectOutputFormat(options.format);
      const shouldStream = options.stream !== false && !isPiped() && format === 'pretty';

      const messages: Message[] = [];

      if (options.continue) {
        const lastConv = getLastConversation();
        if (lastConv) {
          for (const msg of lastConv.messages) {
            messages.push(msg as Message);
          }
          if (format === 'pretty') {
            console.log(c.dim(`Continuing conversation (${lastConv.messages.length} previous messages)\n`));
          }
        }
      }

      if (options.system) {
        messages.push({ role: 'system', content: options.system });
      } else if (options.character) {
        const systemPrompt = getCharacterPrompt(options.character);
        if (systemPrompt) {
          messages.push({ role: 'system', content: systemPrompt });
        }
      }

      if (options.codebase) {
        const ctxDir = typeof options.codebase === 'string' ? options.codebase : process.cwd();
        const maxTokens = parseInt(options.codebsaeTokens ?? String(getMaxContextTokens()), 10);
        startSpinner('Loading codebase...');
        try {
          const ctx = await buildCodebaseContext({ directory: ctxDir, maxTokens });
          clearSpinner();
          if (format === 'pretty') {
            console.log(
              c.dim(`Loaded ${ctx.totalFiles} files (~${ctx.totalTokens} tokens)`) +
              (ctx.truncated ? c.yellow(' [truncated]') : '')
            );
          }
          messages.push({ role: 'system', content: formatContextAsSystemMessage(ctx) });
        } catch (err) {
          clearSpinner();
          console.error(formatError(err instanceof Error ? err.message : String(err)));
          process.exit(1);
        }
      }

      if (options.file?.length) {
        try {
          const fileContexts = await buildFileContext(options.file);
          for (const f of fileContexts) {
            const ext = f.relativePath.split('.').pop() ?? 'txt';
            messages.push({
              role: 'system',
              content: `File: ${f.relativePath}\n\`\`\`${ext}\n${f.content}\n\`\`\``,
            });
          }
          if (format === 'pretty') {
            console.log(c.dim(`Loaded ${fileContexts.length} file(s) into context`));
          }
        } catch (err) {
          console.error(formatError(err instanceof Error ? err.message : String(err)));
          process.exit(1);
        }
      }

      messages.push({ role: 'user', content: prompt });

      const toolNames = options.tools?.split(',').map((t: string) => t.trim()) || [];
      const namedTools = getToolDefinitions(toolNames);
      const agentTools = options.agent ? getAgentToolDefinitions() : [];
      const tools = [...agentTools, ...namedTools];
      const autoApprove: boolean = options.autoApprove ?? getAutoApprove();

      const veniceParams: Record<string, unknown> = {};
      if (options.webSearch) veniceParams.enable_web_search = 'on';
      if (options.thinking === false) veniceParams.disable_thinking = true;
      if (options.stripThinking) veniceParams.strip_thinking_response = true;
      if (options.venicePrompt === false) veniceParams.include_venice_system_prompt = false;
      if (options.searchResultsInStream) veniceParams.include_search_results_in_stream = true;

      try {
        if (shouldStream) {
          await streamChat(messages, model, tools, options.interactiveTools, format, veniceParams, options.stripThinking, autoApprove);
        } else {
          await nonStreamChat(messages, model, tools, options.interactiveTools, format, veniceParams, autoApprove);
        }

        addConversation({
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          messages,
          model,
          character: options.character,
        });
      } catch (error) {
        console.error(formatError(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

interface ThinkingState {
  inThinkingBlock: boolean;
  thinkingBuffer: string;
  tagBuffer: string;
}

function processThinkingContent(
  content: string,
  state: ThinkingState,
  options: { strip: boolean; format: OutputFormat },
  chalk: ReturnType<typeof getChalk>
): { output: string; state: ThinkingState } {
  let output = '';
  let text = state.tagBuffer + content;
  let { inThinkingBlock, thinkingBuffer } = state;
  let tagBuffer = '';

  while (text.length > 0) {
    if (!inThinkingBlock) {
      const openIdx = text.indexOf('<think>');
      if (openIdx === -1) {
        const partialIdx = text.lastIndexOf('<');
        if (partialIdx !== -1 && partialIdx > text.length - 7) {
          output += text.slice(0, partialIdx);
          tagBuffer = text.slice(partialIdx);
          text = '';
        } else {
          output += text;
          text = '';
        }
      } else {
        output += text.slice(0, openIdx);
        text = text.slice(openIdx + 7);
        inThinkingBlock = true;
        thinkingBuffer = '';
      }
    } else {
      const closeIdx = text.indexOf('</think>');
      if (closeIdx === -1) {
        const partialIdx = text.lastIndexOf('<');
        if (partialIdx !== -1 && partialIdx > text.length - 8) {
          thinkingBuffer += text.slice(0, partialIdx);
          tagBuffer = text.slice(partialIdx);
          text = '';
        } else {
          thinkingBuffer += text;
          text = '';
        }
      } else {
        thinkingBuffer += text.slice(0, closeIdx);
        text = text.slice(closeIdx + 8);
        inThinkingBlock = false;
        if (!options.strip && thinkingBuffer.trim()) {
          if (options.format === 'pretty') {
            output += chalk.dim('💭 ' + thinkingBuffer.trim()) + '\n';
          } else {
            output += thinkingBuffer;
          }
        }
        thinkingBuffer = '';
      }
    }
  }

  return { output, state: { inThinkingBlock, thinkingBuffer, tagBuffer } };
}

function flushThinkingState(state: ThinkingState): string {
  let output = '';
  if (state.inThinkingBlock && state.thinkingBuffer) {
    output += state.thinkingBuffer;
  }
  if (state.tagBuffer) {
    output += state.tagBuffer;
  }
  return output;
}

interface StreamToolCallDelta {
  index?: number;
  id?: string;
  type?: 'function';
  function?: { name?: string; arguments?: string };
}

interface AccumulatedStreamToolCall {
  order: number;
  index?: number;
  id?: string;
  function: { name: string; arguments: string };
}

function reconstructStreamToolCalls(toolCallDeltas: StreamToolCallDelta[]): ToolCall[] {
  const callsByIndex = new Map<number, AccumulatedStreamToolCall>();
  const callsById = new Map<string, AccumulatedStreamToolCall>();
  const orderedCalls: AccumulatedStreamToolCall[] = [];

  for (const [position, delta] of toolCallDeltas.entries()) {
    const index = typeof delta.index === 'number' ? delta.index : undefined;
    const id = typeof delta.id === 'string' && delta.id.length > 0 ? delta.id : undefined;

    let accumulated: AccumulatedStreamToolCall | undefined;
    if (index !== undefined) accumulated = callsByIndex.get(index);
    if (!accumulated && id) accumulated = callsById.get(id);
    if (!accumulated && index !== undefined && orderedCalls[index]?.index === undefined) {
      accumulated = orderedCalls[index];
    }

    if (!accumulated) {
      accumulated = { order: position, index, id, function: { name: '', arguments: '' } };
      orderedCalls.push(accumulated);
    }

    if (index !== undefined) { accumulated.index = index; callsByIndex.set(index, accumulated); }
    if (id) { accumulated.id = id; callsById.set(id, accumulated); }
    if (delta.function?.name) accumulated.function.name = delta.function.name;
    if (delta.function?.arguments) accumulated.function.arguments += delta.function.arguments;
  }

  return orderedCalls
    .sort((a, b) => {
      if (a.index !== undefined && b.index !== undefined) return a.index - b.index;
      if (a.index !== undefined) return -1;
      if (b.index !== undefined) return 1;
      return a.order - b.order;
    })
    .map((tc, pos): ToolCall => ({
      id: tc.id || `stream_tool_call_${tc.index ?? pos}`,
      type: 'function',
      function: { name: tc.function.name, arguments: tc.function.arguments },
    }));
}

function parseToolCallArguments(toolCall: ToolCall): Record<string, unknown> {
  const rawArgs = toolCall.function.arguments?.trim();
  if (!rawArgs) return {};
  try {
    return JSON.parse(rawArgs) as Record<string, unknown>;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON arguments for tool "${toolCall.function.name}" (id: ${toolCall.id}): ${reason}`);
  }
}

async function streamChat(
  messages: Message[],
  model: string,
  tools: ReturnType<typeof getToolDefinitions>,
  interactiveTools: boolean,
  format: OutputFormat,
  veniceParams?: Record<string, unknown>,
  stripThinking = false,
  autoApprove = false
): Promise<void> {
  const c = getChalk();

  let fullContent = '';
  let collectedToolCalls: StreamToolCallDelta[] = [];
  let usage: any = null;
  let thinkingState: ThinkingState = { inThinkingBlock: false, thinkingBuffer: '', tagBuffer: '' };

  startSpinner('Thinking...');

  try {
    const streamOptions: {
      model: string;
      tools?: typeof tools;
      venice_parameters?: Record<string, unknown>;
    } = { model, tools };
    if (veniceParams && Object.keys(veniceParams).length > 0) {
      streamOptions.venice_parameters = veniceParams;
    }

    for await (const chunk of chatCompletionStream(messages, streamOptions)) {
      if (chunk.content) {
        clearSpinner();

        const { output, state: newState } = processThinkingContent(
          chunk.content,
          thinkingState,
          { strip: stripThinking, format },
          c
        );
        thinkingState = newState;
        if (output) process.stdout.write(output);
        fullContent += chunk.content;
      }

      if (chunk.tool_calls) {
        collectedToolCalls.push(...(chunk.tool_calls as StreamToolCallDelta[]));
      }

      if (chunk.usage) usage = chunk.usage;
      if (chunk.done) break;
    }

    const remaining = flushThinkingState(thinkingState);
    if (remaining) process.stdout.write(remaining);

    if (collectedToolCalls.length > 0) {
      console.log('\n');
      const toolCalls = reconstructStreamToolCalls(collectedToolCalls);

      for (const toolCall of toolCalls) {
        if (!toolCall.function.name) {
          throw new Error(`Incomplete tool call received for id "${toolCall.id}"`);
        }

        const args = parseToolCallArguments(toolCall);
        const result = await executeTool(toolCall.function.name, args, { interactive: interactiveTools, autoApprove });

        console.log(c.dim(`\n[Tool: ${toolCall.function.name}]`));
        console.log(result);

        messages.push({ role: 'assistant', content: fullContent, tool_calls: [toolCall] });
        messages.push({ role: 'tool', content: result, tool_call_id: toolCall.id });

        console.log('\n');
        for await (const chunk of chatCompletionStream(messages, { model })) {
          if (chunk.content) process.stdout.write(chunk.content);
          if (chunk.usage) usage = chunk.usage;
        }
      }
    }

    console.log('\n');
    if (usage && format === 'pretty') console.log(formatUsage(usage));
  } catch (error) {
    clearSpinner();
    throw error;
  }
}

async function nonStreamChat(
  messages: Message[],
  model: string,
  tools: ReturnType<typeof getToolDefinitions>,
  interactiveTools: boolean,
  format: OutputFormat,
  veniceParams?: Record<string, unknown>,
  autoApprove = false
): Promise<void> {
  const chatOptions: { model: string; tools?: typeof tools; venice_parameters?: Record<string, unknown> } = { model, tools };
  if (veniceParams && Object.keys(veniceParams).length > 0) {
    chatOptions.venice_parameters = veniceParams;
  }
  const response = await chatCompletion(messages, chatOptions);

  if (response.tool_calls?.length) {
    for (const toolCall of response.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments || '{}');
      const result = await executeTool(toolCall.function.name, args, { interactive: interactiveTools, autoApprove });

      messages.push({ role: 'assistant', content: response.content, tool_calls: [toolCall] });
      messages.push({ role: 'tool', content: result, tool_call_id: toolCall.id });
    }

    const followUp = await chatCompletion(messages, { model });
    outputResponse(followUp.content, format);
    if (followUp.usage && format === 'pretty') console.log(formatUsage(followUp.usage));
  } else {
    outputResponse(response.content, format);
    if (response.usage && format === 'pretty') console.log(formatUsage(response.usage));
  }
}

function outputResponse(content: string, format: OutputFormat): void {
  switch (format) {
    case 'json':
      console.log(JSON.stringify({ content }, null, 2));
      break;
    default:
      console.log(content);
      break;
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8').trim();
}

const CHARACTER_PROMPTS: Record<string, string> = {
  pirate: 'You are a pirate captain. Respond in pirate speak with nautical terms, "arr"s, and maritime metaphors.',
  wizard: 'You are a wise wizard. Speak in mystical terms, reference ancient knowledge, and use archaic language.',
  scientist: 'You are a brilliant scientist. Explain things with precision and intellectual rigor.',
  poet: 'You are a romantic poet. Express yourself with beautiful language, metaphors, and emotional depth.',
  coder: 'You are a senior software engineer. Be practical, reference best practices, and provide code examples.',
  teacher: 'You are a patient teacher. Explain concepts clearly, use examples, and encourage curiosity.',
  comedian: 'You are a stand-up comedian. Find humor in everything, make jokes, and keep things light.',
  philosopher: 'You are a deep philosopher. Question assumptions and explore ideas from multiple angles.',
};

function getCharacterPrompt(character: string): string | undefined {
  return CHARACTER_PROMPTS[character.toLowerCase()];
}

export function getAvailableCharacters(): string[] {
  return Object.keys(CHARACTER_PROMPTS);
}
