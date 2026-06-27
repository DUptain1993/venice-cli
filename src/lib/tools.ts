/**
 * Built-in Tools for Function Calling
 *
 * These tools can be used with --tools flag in chat command.
 */

import type { ToolDefinition } from '../types/index.js';
import * as readline from 'readline';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getChalk } from './output.js';

const execAsync = promisify(exec);

// Patterns ignored by list_files and search_files
const FS_IGNORE_NAMES = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target',
  'coverage', '.next', '.nuxt', '__pycache__', 'vendor',
]);

// Tools that always require approval unless autoApprove is set
const DESTRUCTIVE_TOOLS = new Set(['run_shell', 'write_file', 'delete_file']);

// Built-in tool definitions
export const BUILTIN_TOOLS: Record<string, ToolDefinition> = {
  calculator: {
    type: 'function',
    function: {
      name: 'calculator',
      description: 'Perform mathematical calculations. Supports basic arithmetic, powers, roots, and common math functions.',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'Mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)", "sin(3.14)")',
          },
        },
        required: ['expression'],
      },
    },
  },

  weather: {
    type: 'function',
    function: {
      name: 'weather',
      description: 'Get current weather information for a location. Note: This is a simulated tool for demonstration.',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'City name or location (e.g., "San Francisco, CA")',
          },
          units: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
            description: 'Temperature units',
          },
        },
        required: ['location'],
      },
    },
  },

  datetime: {
    type: 'function',
    function: {
      name: 'datetime',
      description: 'Get current date and time information',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'Timezone (e.g., "America/New_York", "UTC")',
          },
          format: {
            type: 'string',
            description: 'Output format: "full", "date", "time", or custom strftime format',
          },
        },
        required: [],
      },
    },
  },

  random: {
    type: 'function',
    function: {
      name: 'random',
      description: 'Generate random numbers or make random selections',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['number', 'choice', 'uuid'],
            description: 'Type of random value to generate',
          },
          min: {
            type: 'number',
            description: 'Minimum value (for number type)',
          },
          max: {
            type: 'number',
            description: 'Maximum value (for number type)',
          },
          choices: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of choices to pick from (for choice type)',
          },
        },
        required: ['type'],
      },
    },
  },

  base64: {
    type: 'function',
    function: {
      name: 'base64',
      description: 'Encode or decode base64 strings',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['encode', 'decode'],
            description: 'Whether to encode or decode',
          },
          text: {
            type: 'string',
            description: 'Text to encode or decode',
          },
        },
        required: ['action', 'text'],
      },
    },
  },

  hash: {
    type: 'function',
    function: {
      name: 'hash',
      description: 'Generate hash of text',
      parameters: {
        type: 'object',
        properties: {
          algorithm: {
            type: 'string',
            enum: ['md5', 'sha1', 'sha256', 'sha512'],
            description: 'Hash algorithm to use',
          },
          text: {
            type: 'string',
            description: 'Text to hash',
          },
        },
        required: ['algorithm', 'text'],
      },
    },
  },

  read_file: {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file. Returns text content. Supports optional line offset and limit.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path (relative to cwd or absolute)' },
          offset: { type: 'number', description: 'Line number to start reading from (1-based, optional)' },
          limit: { type: 'number', description: 'Maximum number of lines to return (optional)' },
        },
        required: ['path'],
      },
    },
  },

  write_file: {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file, creating parent directories if needed. Overwrites existing files.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to write to' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },

  list_files: {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in a directory recursively. Skips node_modules, .git, and build directories.',
      parameters: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Directory to list (defaults to current directory)' },
          pattern: { type: 'string', description: 'Glob pattern to filter files (e.g. "**/*.ts")' },
          max_depth: { type: 'number', description: 'Maximum recursion depth (default: 5)' },
        },
        required: [],
      },
    },
  },

  search_files: {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for a regex pattern in file contents. Returns matching file, line number, and text.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search for' },
          directory: { type: 'string', description: 'Directory to search in (defaults to cwd)' },
          file_pattern: { type: 'string', description: 'Glob pattern to restrict which files to search (e.g. "*.ts")' },
        },
        required: ['pattern'],
      },
    },
  },

  delete_file: {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file. Requires confirm:true to prevent accidental deletion.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to delete' },
          confirm: { type: 'boolean', description: 'Must be true to confirm deletion' },
        },
        required: ['path', 'confirm'],
      },
    },
  },

  run_shell: {
    type: 'function',
    function: {
      name: 'run_shell',
      description: 'Execute a shell command in the current working directory. Returns stdout, stderr, and exit code.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          cwd: { type: 'string', description: 'Working directory override (optional)' },
          timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
        },
        required: ['command'],
      },
    },
  },
};

// Safe math expression evaluator without eval/Function
function safeEvaluateMath(expression: string): number {
  const tokens = tokenize(expression);
  const rpn = shuntingYard(tokens);
  return evaluateRPN(rpn);
}

type Token = { type: 'number'; value: number } | { type: 'operator'; value: string } | { type: 'function'; value: string } | { type: 'lparen' } | { type: 'rparen' } | { type: 'comma' };

const MATH_FUNCTIONS: Record<string, (args: number[]) => number> = {
  sqrt: (args) => Math.sqrt(args[0]),
  sin: (args) => Math.sin(args[0]),
  cos: (args) => Math.cos(args[0]),
  tan: (args) => Math.tan(args[0]),
  log: (args) => Math.log(args[0]),
  log10: (args) => Math.log10(args[0]),
  exp: (args) => Math.exp(args[0]),
  abs: (args) => Math.abs(args[0]),
  pow: (args) => Math.pow(args[0], args[1]),
  floor: (args) => Math.floor(args[0]),
  ceil: (args) => Math.ceil(args[0]),
  round: (args) => Math.round(args[0]),
  min: (args) => Math.min(...args),
  max: (args) => Math.max(...args),
};

const MATH_CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

const OPERATORS: Record<string, { precedence: number; assoc: 'left' | 'right' }> = {
  '+': { precedence: 1, assoc: 'left' },
  '-': { precedence: 1, assoc: 'left' },
  '*': { precedence: 2, assoc: 'left' },
  '/': { precedence: 2, assoc: 'left' },
  '%': { precedence: 2, assoc: 'left' },
  '^': { precedence: 3, assoc: 'right' },
};

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = expr.replace(/\s+/g, '');

  while (i < s.length) {
    const char = s[i];

    if (/[0-9.]/.test(char)) {
      let num = '';
      while (i < s.length && /[0-9.]/.test(s[i])) {
        num += s[i++];
      }
      tokens.push({ type: 'number', value: parseFloat(num) });
      continue;
    }

    if (/[a-zA-Z_]/.test(char)) {
      let name = '';
      while (i < s.length && /[a-zA-Z0-9_]/.test(s[i])) {
        name += s[i++];
      }
      const lower = name.toLowerCase();
      if (MATH_CONSTANTS[lower] !== undefined) {
        tokens.push({ type: 'number', value: MATH_CONSTANTS[lower] });
      } else if (MATH_FUNCTIONS[lower]) {
        tokens.push({ type: 'function', value: lower });
      } else {
        throw new Error(`Unknown identifier: ${name}`);
      }
      continue;
    }

    if (char === '(') {
      tokens.push({ type: 'lparen' });
      i++;
      continue;
    }

    if (char === ')') {
      tokens.push({ type: 'rparen' });
      i++;
      continue;
    }

    if (char === ',') {
      tokens.push({ type: 'comma' });
      i++;
      continue;
    }

    if (OPERATORS[char]) {
      tokens.push({ type: 'operator', value: char });
      i++;
      continue;
    }

    throw new Error(`Unexpected character: ${char}`);
  }

  return tokens;
}

function shuntingYard(tokens: Token[]): (Token | { type: 'function'; value: string; argCount: number })[] {
  const output: (Token | { type: 'function'; value: string; argCount: number })[] = [];
  const opStack: (Token | (Token & { argCount: number }))[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === 'number') {
      output.push(token);
    } else if (token.type === 'function') {
      opStack.push({ ...token, argCount: 1 });
    } else if (token.type === 'comma') {
      while (opStack.length > 0 && (opStack[opStack.length - 1] as Token).type !== 'lparen') {
        output.push(opStack.pop() as Token);
      }
      const fnToken = opStack.find((t): t is Token & { argCount: number } => 
        'argCount' in t && t.type === 'function'
      );
      if (fnToken) {
        fnToken.argCount++;
      }
    } else if (token.type === 'operator') {
      const o1 = OPERATORS[token.value];
      while (opStack.length > 0) {
        const top = opStack[opStack.length - 1] as Token;
        if (top.type !== 'operator') break;
        const o2 = OPERATORS[top.value];
        if (o2.precedence > o1.precedence || (o2.precedence === o1.precedence && o1.assoc === 'left')) {
          output.push(opStack.pop() as Token);
        } else {
          break;
        }
      }
      opStack.push(token);
    } else if (token.type === 'lparen') {
      opStack.push(token);
    } else if (token.type === 'rparen') {
      while (opStack.length > 0 && (opStack[opStack.length - 1] as Token).type !== 'lparen') {
        output.push(opStack.pop() as Token);
      }
      if (opStack.length === 0) throw new Error('Mismatched parentheses');
      opStack.pop();
      if (opStack.length > 0 && (opStack[opStack.length - 1] as Token).type === 'function') {
        output.push(opStack.pop() as Token & { argCount: number });
      }
    }
  }

  while (opStack.length > 0) {
    const top = opStack.pop() as Token;
    if (top.type === 'lparen' || top.type === 'rparen') {
      throw new Error('Mismatched parentheses');
    }
    output.push(top);
  }

  return output;
}

function evaluateRPN(tokens: (Token | { type: 'function'; value: string; argCount: number })[]): number {
  const stack: number[] = [];

  for (const token of tokens) {
    if (token.type === 'number') {
      stack.push(token.value);
    } else if (token.type === 'operator') {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) throw new Error('Invalid expression');
      switch (token.value) {
        case '+': stack.push(a + b); break;
        case '-': stack.push(a - b); break;
        case '*': stack.push(a * b); break;
        case '/': 
          if (b === 0) throw new Error('Division by zero');
          stack.push(a / b); 
          break;
        case '%': stack.push(a % b); break;
        case '^': stack.push(Math.pow(a, b)); break;
      }
    } else if (token.type === 'function') {
      const fn = MATH_FUNCTIONS[token.value];
      const argCount = 'argCount' in token ? token.argCount : 1;
      const args: number[] = [];
      for (let i = 0; i < argCount; i++) {
        const arg = stack.pop();
        if (arg === undefined) throw new Error(`Not enough arguments for ${token.value}`);
        args.unshift(arg);
      }
      stack.push(fn(args));
    }
  }

  if (stack.length !== 1) throw new Error('Invalid expression');
  return stack[0];
}

// ── File system helpers ──────────────────────────────────────────────────────

function globToRegex(pattern: string): RegExp {
  let result = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      result += '.*';
      i += 2;
      if (pattern[i] === '/') i++;
    } else if (c === '*') {
      result += '[^/]*';
      i++;
    } else if (c === '?') {
      result += '[^/]';
      i++;
    } else if (/[.+^${}()|[\]\\]/.test(c)) {
      result += '\\' + c;
      i++;
    } else {
      result += c;
      i++;
    }
  }
  return new RegExp(result + '$');
}

async function walkDir(
  dir: string,
  maxDepth: number,
  depth: number = 0
): Promise<string[]> {
  if (depth >= maxDepth) return [];
  const files: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (FS_IGNORE_NAMES.has(entry.name) || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await walkDir(fullPath, maxDepth, depth + 1));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch {
    // Skip unreadable directories
  }
  return files;
}

// ── Tool execution functions ─────────────────────────────────────────────────

const toolExecutors: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
  async calculator(args: Record<string, unknown>): Promise<string> {
    try {
      const expression = args.expression as string;
      const result = safeEvaluateMath(expression);
      if (!Number.isFinite(result)) {
        return `Error: Result is ${result}`;
      }
      return `Result: ${result}`;
    } catch (error) {
      return `Error evaluating expression: ${error instanceof Error ? error.message : String(error)}`;
    }
  },

  async weather(args: Record<string, unknown>): Promise<string> {
    const location = args.location as string;
    const units = (args.units as string) || 'fahrenheit';
    
    // Simulated weather data - clearly marked as demonstration
    const temp = units === 'celsius' 
      ? Math.round(15 + Math.random() * 20)
      : Math.round(60 + Math.random() * 30);
    const conditions = ['sunny', 'partly cloudy', 'cloudy', 'light rain', 'clear'];
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    
    return JSON.stringify({
      location,
      temperature: `${temp}°${units === 'celsius' ? 'C' : 'F'}`,
      conditions: condition,
      humidity: `${Math.round(40 + Math.random() * 40)}%`,
      simulated: true,
      note: 'This is simulated data for demonstration. Integrate a real weather API for production use.',
    }, null, 2);
  },

  async datetime(args: Record<string, unknown>): Promise<string> {
    const now = new Date();
    const timezone = args.timezone as string | undefined;
    const format = args.format as string | undefined;
    
    if (timezone) {
      try {
        return now.toLocaleString('en-US', { timeZone: timezone });
      } catch {
        return `Invalid timezone: ${timezone}. Using local time: ${now.toLocaleString()}`;
      }
    }
    
    switch (format) {
      case 'date':
        return now.toLocaleDateString();
      case 'time':
        return now.toLocaleTimeString();
      case 'full':
      default:
        return now.toLocaleString();
    }
  },

  async random(args: Record<string, unknown>): Promise<string> {
    const type = args.type as string;
    const min = typeof args.min === 'number' ? args.min : 0;
    const max = typeof args.max === 'number' ? args.max : 100;
    const choices = args.choices as string[] | undefined;

    switch (type) {
      case 'number': {
        if (min > max) return 'Error: min cannot be greater than max';
        const result = Math.floor(Math.random() * (max - min + 1)) + min;
        return `Random number between ${min} and ${max}: ${result}`;
      }
      case 'choice': {
        if (!choices?.length) {
          return 'Error: No choices provided';
        }
        const choice = choices[Math.floor(Math.random() * choices.length)];
        return `Random choice: ${choice}`;
      }
      case 'uuid': {
        const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
        return `UUID: ${uuid}`;
      }
      default:
        return `Unknown random type: ${type}`;
    }
  },

  async base64(args: Record<string, unknown>): Promise<string> {
    const action = args.action as string;
    const text = args.text as string;
    
    if (action === 'encode') {
      return Buffer.from(text).toString('base64');
    } else {
      try {
        return Buffer.from(text, 'base64').toString('utf-8');
      } catch {
        return 'Error: Invalid base64 string';
      }
    }
  },

  async hash(args: Record<string, unknown>): Promise<string> {
    const algorithm = args.algorithm as string;
    const text = args.text as string;
    const validAlgorithms = ['md5', 'sha1', 'sha256', 'sha512'];

    if (!validAlgorithms.includes(algorithm)) {
      return `Error: Invalid hash algorithm "${algorithm}". Use one of: ${validAlgorithms.join(', ')}`;
    }

    const crypto = await import('crypto');
    const hash = crypto.createHash(algorithm);
    hash.update(text);
    return hash.digest('hex');
  },

  async read_file(args: Record<string, unknown>): Promise<string> {
    const filePath = path.resolve(process.cwd(), args.path as string);
    const offset = typeof args.offset === 'number' ? Math.max(1, args.offset) : 1;
    const limit = typeof args.limit === 'number' ? args.limit : undefined;

    try {
      const stat = await fs.stat(filePath);
      if (stat.size > 1024 * 1024) {
        return JSON.stringify({ error: `File too large (${Math.round(stat.size / 1024)}KB). Max 1MB.` });
      }
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const startIdx = offset - 1;
      const endIdx = limit !== undefined ? startIdx + limit : lines.length;
      const selected = lines.slice(startIdx, endIdx);
      return JSON.stringify({
        path: args.path,
        lines: selected.length,
        total_lines: lines.length,
        content: selected.join('\n'),
      });
    } catch (err) {
      return JSON.stringify({ error: `Cannot read "${args.path}": ${err instanceof Error ? err.message : String(err)}` });
    }
  },

  async write_file(args: Record<string, unknown>): Promise<string> {
    const filePath = path.resolve(process.cwd(), args.path as string);
    const content = args.content as string;
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
      return JSON.stringify({ success: true, path: args.path, bytes: Buffer.byteLength(content, 'utf-8') });
    } catch (err) {
      return JSON.stringify({ error: `Cannot write "${args.path}": ${err instanceof Error ? err.message : String(err)}` });
    }
  },

  async list_files(args: Record<string, unknown>): Promise<string> {
    const dir = path.resolve(process.cwd(), (args.directory as string | undefined) ?? '.');
    const pattern = args.pattern as string | undefined;
    const maxDepth = typeof args.max_depth === 'number' ? args.max_depth : 5;
    const patternRegex = pattern ? globToRegex(pattern) : null;

    try {
      const allFiles = await walkDir(dir, maxDepth);
      const relFiles = allFiles
        .map(f => path.relative(dir, f))
        .filter(f => !patternRegex || patternRegex.test(f))
        .slice(0, 500);
      return JSON.stringify({ directory: args.directory ?? '.', count: relFiles.length, files: relFiles });
    } catch (err) {
      return JSON.stringify({ error: `Cannot list "${args.directory}": ${err instanceof Error ? err.message : String(err)}` });
    }
  },

  async search_files(args: Record<string, unknown>): Promise<string> {
    const dir = path.resolve(process.cwd(), (args.directory as string | undefined) ?? '.');
    const pattern = args.pattern as string;
    const filePattern = args.file_pattern as string | undefined;
    const fileRegex = filePattern ? globToRegex(filePattern) : null;

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'i');
    } catch {
      return JSON.stringify({ error: `Invalid regex: ${pattern}` });
    }

    const allFiles = await walkDir(dir, 8);
    const matches: Array<{ file: string; line: number; content: string }> = [];

    for (const filePath of allFiles) {
      const rel = path.relative(dir, filePath);
      if (fileRegex && !fileRegex.test(rel)) continue;
      try {
        const stat = await fs.stat(filePath);
        if (stat.size > 1024 * 1024) continue;
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            matches.push({ file: rel, line: i + 1, content: lines[i].trim().slice(0, 200) });
            if (matches.length >= 50) break;
          }
        }
        if (matches.length >= 50) break;
      } catch {
        // Skip unreadable files
      }
    }

    return JSON.stringify({ pattern, count: matches.length, matches });
  },

  async delete_file(args: Record<string, unknown>): Promise<string> {
    if (args.confirm !== true) {
      return JSON.stringify({ error: 'confirm must be true to delete a file' });
    }
    const filePath = path.resolve(process.cwd(), args.path as string);
    try {
      await fs.unlink(filePath);
      return JSON.stringify({ success: true, path: args.path });
    } catch (err) {
      return JSON.stringify({ error: `Cannot delete "${args.path}": ${err instanceof Error ? err.message : String(err)}` });
    }
  },

  async run_shell(args: Record<string, unknown>): Promise<string> {
    const command = args.command as string;
    const cwd = args.cwd ? path.resolve(args.cwd as string) : process.cwd();
    const timeout = typeof args.timeout === 'number' ? args.timeout : 30000;
    try {
      const { stdout, stderr } = await execAsync(command, { cwd, timeout });
      return JSON.stringify({ success: true, command, stdout: stdout.slice(0, 8000), stderr: stderr.slice(0, 2000), exit_code: 0 });
    } catch (err: any) {
      return JSON.stringify({
        success: false,
        command,
        stdout: (err.stdout ?? '').slice(0, 8000),
        stderr: (err.stderr ?? err.message ?? '').slice(0, 2000),
        exit_code: err.code ?? 1,
      });
    }
  },
};

export function getToolDefinitions(toolNames: string[]): ToolDefinition[] {
  return toolNames
    .map(name => BUILTIN_TOOLS[name])
    .filter(Boolean);
}

export function listAvailableTools(): string[] {
  return Object.keys(BUILTIN_TOOLS);
}

export async function executeTool(
  name: string,
  args: unknown,
  options: { interactive?: boolean; autoApprove?: boolean } = {}
): Promise<string> {
  const executor = toolExecutors[name];
  if (!executor) {
    return `Unknown tool: ${name}`;
  }

  // Destructive tools always prompt unless autoApprove is set
  const needsApproval =
    options.interactive || (DESTRUCTIVE_TOOLS.has(name) && !options.autoApprove);

  if (needsApproval) {
    const approved = await promptForApproval(name, args);
    if (!approved) {
      return 'Tool execution cancelled by user';
    }
  }

  try {
    return await executor(args as Record<string, unknown>);
  } catch (error) {
    return `Tool error: ${error}`;
  }
}

export function getAgentToolDefinitions(): ToolDefinition[] {
  return ['read_file', 'write_file', 'list_files', 'search_files', 'delete_file', 'run_shell']
    .map(name => BUILTIN_TOOLS[name])
    .filter(Boolean);
}

async function promptForApproval(name: string, args: unknown): Promise<boolean> {
  const c = getChalk();
  
  console.log('\n' + c.yellow('⚡ Tool Call Request'));
  console.log(`${c.cyan('Tool:')} ${name}`);
  console.log(`${c.cyan('Args:')} ${JSON.stringify(args, null, 2)}`);
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(c.yellow('\nApprove? [y/N] '), (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export function formatToolsHelp(): string {
  const c = getChalk();
  const lines: string[] = [
    c.bold('Available Tools:'),
    '',
  ];

  for (const [name, def] of Object.entries(BUILTIN_TOOLS)) {
    lines.push(`  ${c.cyan(name)}`);
    lines.push(`    ${def.function.description}`);
    lines.push('');
  }

  lines.push(c.dim('Usage: venice chat "prompt" --tools calculator,weather'));
  
  return lines.join('\n');
}
