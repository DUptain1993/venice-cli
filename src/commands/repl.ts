import { Command } from 'commander';
import * as readline from 'readline/promises';
import * as fs from 'fs/promises';
import { chatCompletionStream } from '../lib/api.js';
import {
  requireApiKey,
  getDefaultModel,
  getAutoApprove,
  getMaxContextTokens,
  addConversation,
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
  getChalk,
  formatError,
  formatUsage,
  startSpinner,
  clearSpinner,
} from '../lib/output.js';
import type { Message, ToolDefinition, ToolCall } from '../types/index.js';
import { randomUUID } from 'crypto';

interface ReplState {
  messages: Message[];
  model: string;
  autoApprove: boolean;
  toolsEnabled: boolean;
  tools: ToolDefinition[];
  systemPrompt: string;
}

interface StreamToolCallDelta {
  index?: number;
  id?: string;
  type?: 'function';
  function?: { name?: string; arguments?: string };
}

function reconstructToolCalls(deltas: StreamToolCallDelta[]): ToolCall[] {
  const byIndex = new Map<number, { id?: string; name: string; arguments: string; order: number }>();
  const ordered: Array<{ id?: string; name: string; arguments: string; order: number; index: number }> = [];

  for (const [pos, delta] of deltas.entries()) {
    const idx = delta.index ?? pos;
    if (!byIndex.has(idx)) {
      byIndex.set(idx, { id: delta.id, name: '', arguments: '', order: pos });
    }
    const entry = byIndex.get(idx)!;
    if (delta.id) entry.id = delta.id;
    if (delta.function?.name) entry.name += delta.function.name;
    if (delta.function?.arguments) entry.arguments += delta.function.arguments;
  }

  for (const [index, entry] of byIndex.entries()) {
    ordered.push({ ...entry, index });
  }

  return ordered
    .sort((a, b) => a.index - b.index)
    .map((entry, i): ToolCall => ({
      id: entry.id ?? `tool_${i}`,
      type: 'function',
      function: { name: entry.name, arguments: entry.arguments },
    }));
}

async function streamResponse(
  state: ReplState,
): Promise<void> {
  const c = getChalk();
  let fullContent = '';
  let usage: Record<string, number> | null = null;
  const collectedToolCalls: StreamToolCallDelta[] = [];

  const spinner = startSpinner('Thinking...');

  try {
    for await (const chunk of chatCompletionStream(state.messages, {
      model: state.model,
      tools: state.toolsEnabled ? state.tools : undefined,
    })) {
      if (chunk.content) {
        if (spinner) clearSpinner();
        process.stdout.write(chunk.content);
        fullContent += chunk.content;
      }
      if (chunk.tool_calls) {
        collectedToolCalls.push(...(chunk.tool_calls as StreamToolCallDelta[]));
      }
      if (chunk.usage) usage = chunk.usage as Record<string, number>;
      if (chunk.done) break;
    }

    clearSpinner();

    // Handle tool calls
    if (collectedToolCalls.length > 0) {
      process.stdout.write('\n');
      const toolCalls = reconstructToolCalls(collectedToolCalls);

      for (const toolCall of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          // empty args
        }

        const result = await executeTool(
          toolCall.function.name,
          args,
          { autoApprove: state.autoApprove }
        );

        console.log(c.dim(`\n[Tool: ${toolCall.function.name}] `) + result.slice(0, 200));

        state.messages.push({
          role: 'assistant',
          content: fullContent,
          tool_calls: [toolCall],
        });
        state.messages.push({
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id,
        });

        // Get follow-up response after tool
        process.stdout.write('\n');
        for await (const chunk of chatCompletionStream(state.messages, { model: state.model })) {
          if (chunk.content) {
            process.stdout.write(chunk.content);
            fullContent += chunk.content;
          }
          if (chunk.usage) usage = chunk.usage as Record<string, number>;
        }
      }
    } else {
      // Only push assistant message when no tool calls (tool flow pushes above)
      state.messages.push({ role: 'assistant', content: fullContent });
    }

    process.stdout.write('\n');
    if (usage) {
      const usageStr = formatUsage(usage as Parameters<typeof formatUsage>[0]);
      if (usageStr) console.log(usageStr);
    }
  } catch (err) {
    clearSpinner();
    throw err;
  }
}

async function handleSlashCommand(
  input: string,
  state: ReplState,
  rl: readline.Interface,
): Promise<boolean> {
  const c = getChalk();
  const parts = input.slice(1).trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const arg = parts.slice(1).join(' ');

  switch (cmd) {
    case 'exit':
    case 'quit':
      rl.close();
      console.log('Goodbye!');
      process.exit(0);
      break;

    case 'clear':
      state.messages = state.systemPrompt
        ? [{ role: 'system', content: state.systemPrompt }]
        : [];
      console.log(c.dim('Conversation cleared.'));
      break;

    case 'model':
      if (arg) {
        state.model = arg;
        console.log(c.dim(`Model switched to: ${c.cyan(state.model)}`));
      } else {
        console.log(`Current model: ${c.cyan(state.model)}`);
      }
      break;

    case 'files':
    case 'codebase': {
      const dir = arg || process.cwd();
      startSpinner('Loading codebase...');
      try {
        const ctx = await buildCodebaseContext({ directory: dir });
        clearSpinner();
        const ctxMsg = formatContextAsSystemMessage(ctx);
        // Remove previous codebase context messages
        state.messages = state.messages.filter(
          m => m.role !== 'system' || m.content === state.systemPrompt
        );
        state.messages.push({ role: 'system', content: ctxMsg });
        console.log(
          c.green('✓') +
          ` Loaded ${ctx.totalFiles} files (~${ctx.totalTokens} tokens)` +
          (ctx.truncated ? c.yellow(' [truncated]') : '')
        );
      } catch (err) {
        clearSpinner();
        console.log(formatError(err instanceof Error ? err.message : String(err)));
      }
      break;
    }

    case 'file': {
      if (!arg) { console.log('Usage: /file <path>'); break; }
      try {
        const [ctxFile] = await buildFileContext([arg]);
        const ext = arg.split('.').pop() ?? 'txt';
        state.messages.push({
          role: 'system',
          content: `File: ${arg}\n\`\`\`${ext}\n${ctxFile.content}\n\`\`\``,
        });
        console.log(c.green('✓') + ` Loaded file: ${arg} (~${ctxFile.tokens} tokens)`);
      } catch (err) {
        console.log(formatError(err instanceof Error ? err.message : String(err)));
      }
      break;
    }

    case 'tools': {
      if (arg === 'off') {
        state.toolsEnabled = false;
        console.log(c.dim('Tools disabled.'));
      } else if (arg === 'on') {
        state.toolsEnabled = true;
        console.log(c.dim('Tools enabled.'));
      } else {
        console.log(formatToolsHelp());
        console.log(`Tools are currently: ${state.toolsEnabled ? c.green('enabled') : c.red('disabled')}`);
      }
      break;
    }

    case 'approve': {
      state.autoApprove = !state.autoApprove;
      console.log(
        `Auto-approve is now: ${state.autoApprove ? c.green('ON') : c.yellow('OFF')}`
      );
      break;
    }

    case 'history': {
      const msgs = state.messages.filter(m => m.role !== 'system');
      const last10 = msgs.slice(-10);
      for (const m of last10) {
        const role = m.role === 'user' ? c.cyan('You') : c.green('AI');
        const preview = m.content.slice(0, 100).replace(/\n/g, ' ');
        console.log(`${role}: ${preview}${m.content.length > 100 ? '…' : ''}`);
      }
      if (msgs.length > 10) console.log(c.dim(`(${msgs.length - 10} earlier messages omitted)`));
      break;
    }

    case 'save': {
      const filename = arg || `venice-chat-${Date.now()}.json`;
      try {
        await fs.writeFile(filename, JSON.stringify({
          model: state.model,
          messages: state.messages,
          savedAt: new Date().toISOString(),
        }, null, 2));
        console.log(c.green('✓') + ` Saved to ${filename}`);
      } catch (err) {
        console.log(formatError(err instanceof Error ? err.message : String(err)));
      }
      break;
    }

    case 'help':
    default: {
      const cmds = [
        ['/exit, /quit', 'Exit the REPL'],
        ['/clear', 'Clear conversation history'],
        ['/model [name]', 'Show or switch model'],
        ['/files [dir]', 'Load codebase into context'],
        ['/file <path>', 'Load a specific file'],
        ['/tools [on|off]', 'Show tools or toggle them'],
        ['/approve', 'Toggle auto-approve for tool calls'],
        ['/history', 'Show recent conversation'],
        ['/save [filename]', 'Save conversation to JSON'],
        ['/help', 'Show this help'],
      ];
      console.log(c.bold('\nAvailable commands:'));
      for (const [cmd2, desc] of cmds) {
        console.log(`  ${c.cyan(cmd2.padEnd(22))} ${desc}`);
      }
      console.log('');
      break;
    }
  }

  return true;
}

export function registerReplCommand(program: Command): void {
  program
    .command('repl')
    .description('Interactive REPL with persistent conversation and file tools')
    .option('-m, --model <model>', 'Model to use')
    .option('-s, --system <prompt>', 'System prompt')
    .option('--codebase', 'Load codebase context at startup')
    .option('--codebase-dir <dir>', 'Directory for codebase context')
    .option('--auto-approve', 'Auto-approve all tool calls without prompting')
    .option('--max-tokens <n>', 'Token budget for codebase context', '80000')
    .option('--no-tools', 'Disable file system tools')
    .option('-t, --tools <tools>', 'Additional comma-separated tools to enable')
    .option('-f, --format <format>', 'Output format')
    .action(async (options) => {
      const c = getChalk();

      requireApiKey();

      const model = options.model ?? getDefaultModel();
      const autoApprove = options.autoApprove ?? getAutoApprove();
      const maxTokens = parseInt(options.maxTokens ?? String(getMaxContextTokens()), 10);

      // Build tool list: agent tools + any extras
      const agentTools = options.tools !== false ? getAgentToolDefinitions() : [];
      const extraToolNames: string[] = options.tools
        ? options.tools.split(',').map((t: string) => t.trim())
        : [];
      const extraTools = getToolDefinitions(extraToolNames);
      const allTools = [...agentTools, ...extraTools];

      const systemPrompt = options.system ?? '';

      const state: ReplState = {
        messages: systemPrompt ? [{ role: 'system', content: systemPrompt }] : [],
        model,
        autoApprove,
        toolsEnabled: options.tools !== false,
        tools: allTools,
        systemPrompt,
      };

      // Print banner
      console.log(c.bold('\nVenice REPL'));
      console.log(c.dim(`Model: ${model} | Tools: ${state.toolsEnabled ? 'enabled' : 'off'} | Auto-approve: ${autoApprove}`));
      console.log(c.dim('Type /help for commands, /exit to quit.\n'));

      // Load codebase context if requested
      if (options.codebase) {
        const dir = options.codebsaeDir ?? process.cwd();
        startSpinner('Loading codebase...');
        try {
          const ctx = await buildCodebaseContext({ directory: dir, maxTokens });
          clearSpinner();
          state.messages.push({ role: 'system', content: formatContextAsSystemMessage(ctx) });
          console.log(
            c.green('✓') +
            ` Loaded ${ctx.totalFiles} files (~${ctx.totalTokens} tokens)` +
            (ctx.truncated ? c.yellow(' [truncated]') : '') + '\n'
          );
        } catch (err) {
          clearSpinner();
          console.log(c.yellow('Warning: Could not load codebase: ') + (err instanceof Error ? err.message : String(err)));
        }
      }

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
        historySize: 100,
      });

      // Handle SIGINT gracefully
      rl.on('SIGINT', () => {
        console.log('\nGoodbye!');
        rl.close();
        process.exit(0);
      });

      // Main REPL loop
      while (true) {
        let input: string;
        try {
          input = await rl.question(c.cyan('venice> '));
        } catch {
          // readline was closed (Ctrl+D / EOF)
          console.log('\nGoodbye!');
          break;
        }

        input = input.trim();
        if (!input) continue;

        if (input.startsWith('/')) {
          await handleSlashCommand(input, state, rl);
          continue;
        }

        // Add user message and stream response
        state.messages.push({ role: 'user', content: input });
        try {
          await streamResponse(state);
        } catch (err) {
          console.log('\n' + formatError(err instanceof Error ? err.message : String(err)));
          // Remove the failed user message
          state.messages.pop();
        }

        // Save to history
        try {
          addConversation({
            id: randomUUID(),
            timestamp: new Date().toISOString(),
            messages: state.messages,
            model: state.model,
          });
        } catch {
          // History save failure is non-critical
        }
      }

      rl.close();
    });
}
