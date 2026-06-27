import * as fs from 'fs/promises';
import * as path from 'path';

export interface ContextOptions {
  directory?: string;
  maxTokens?: number;
  includeExtensions?: string[];
  excludePatterns?: string[];
}

export interface ContextFile {
  path: string;
  relativePath: string;
  content: string;
  tokens: number;
}

export interface CodebaseContext {
  files: ContextFile[];
  totalTokens: number;
  totalFiles: number;
  skippedFiles: number;
  directory: string;
  truncated: boolean;
}

const DEFAULT_INCLUDE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'cs',
  'rb', 'php', 'swift', 'kt', 'scala',
  'sh', 'bash', 'zsh', 'fish',
  'md', 'txt', 'json', 'yaml', 'yml', 'toml', 'ini', 'env',
  'html', 'css', 'scss', 'less', 'vue', 'svelte',
  'sql', 'graphql', 'proto',
]);

const DEFAULT_IGNORE_NAMES = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target',
  'coverage', '.nyc_output', '.next', '.nuxt', '.output',
  '.vscode', '.idea', '__pycache__', '.pytest_cache',
  '.mypy_cache', 'vendor', 'pkg', 'bin',
]);

const PRIORITY_FILES = [
  'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod',
  'tsconfig.json', 'README.md', 'README.txt', '.env.example',
  'Makefile', 'Dockerfile', 'docker-compose.yml',
];

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function parseGitignore(directory: string): Promise<Set<string>> {
  const patterns = new Set<string>();
  try {
    const content = await fs.readFile(path.join(directory, '.gitignore'), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        patterns.add(trimmed.replace(/^\//, '').replace(/\/$/, ''));
      }
    }
  } catch {
    // No .gitignore is fine
  }
  return patterns;
}

function shouldIgnore(name: string, ignorePatterns: Set<string>): boolean {
  if (DEFAULT_IGNORE_NAMES.has(name)) return true;
  if (name.startsWith('.') && name !== '.env.example') return true;
  for (const pattern of ignorePatterns) {
    if (pattern === name || pattern === `${name}/`) return true;
    if (pattern.includes('*') && matchGlob(pattern, name)) return true;
  }
  return false;
}

function matchGlob(pattern: string, str: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\*/g, '__STAR__')
    .replace(/__STAR____STAR__/g, '.*')
    .replace(/__STAR__/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  try {
    return new RegExp(`^${regexStr}$`).test(str);
  } catch {
    return false;
  }
}

function isBinary(buffer: Buffer): boolean {
  for (let i = 0; i < Math.min(buffer.length, 512); i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

async function walkDirectory(
  dir: string,
  ignorePatterns: Set<string>,
  maxDepth: number,
  depth: number = 0
): Promise<string[]> {
  if (depth >= maxDepth) return [];
  const files: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (shouldIgnore(entry.name, ignorePatterns)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await walkDirectory(fullPath, ignorePatterns, maxDepth, depth + 1);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch {
    // Skip unreadable directories
  }
  return files;
}

export async function buildCodebaseContext(options: ContextOptions = {}): Promise<CodebaseContext> {
  const directory = options.directory ?? process.cwd();
  const maxTokens = options.maxTokens ?? 80000;
  const includeExts = options.includeExtensions
    ? new Set(options.includeExtensions)
    : DEFAULT_INCLUDE_EXTENSIONS;

  const ignorePatterns = await parseGitignore(directory);
  if (options.excludePatterns) {
    for (const p of options.excludePatterns) ignorePatterns.add(p);
  }

  const allFiles = await walkDirectory(directory, ignorePatterns, 10);

  // Sort: priority files first, then by modification time (newest first)
  const statCache = new Map<string, { mtime: number; size: number }>();
  await Promise.all(
    allFiles.map(async (f) => {
      try {
        const stat = await fs.stat(f);
        statCache.set(f, { mtime: stat.mtimeMs, size: stat.size });
      } catch {
        statCache.set(f, { mtime: 0, size: 0 });
      }
    })
  );

  const sortedFiles = allFiles.sort((a, b) => {
    const aName = path.basename(a);
    const bName = path.basename(b);
    const aPriority = PRIORITY_FILES.indexOf(aName);
    const bPriority = PRIORITY_FILES.indexOf(bName);
    if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
    if (aPriority !== -1) return -1;
    if (bPriority !== -1) return 1;
    return (statCache.get(b)?.mtime ?? 0) - (statCache.get(a)?.mtime ?? 0);
  });

  const contextFiles: ContextFile[] = [];
  let totalTokens = 0;
  let skippedFiles = 0;
  let truncated = false;

  for (const filePath of sortedFiles) {
    const ext = path.extname(filePath).slice(1).toLowerCase();

    // Check extension (allow extensionless files like Makefile, Dockerfile)
    if (ext && !includeExts.has(ext)) {
      skippedFiles++;
      continue;
    }

    const stat = statCache.get(filePath);
    if (!stat || stat.size > 100 * 1024) {
      skippedFiles++;
      continue;
    }

    try {
      const rawBuffer = await fs.readFile(filePath);
      if (isBinary(rawBuffer)) {
        skippedFiles++;
        continue;
      }

      const content = rawBuffer.toString('utf-8');
      const tokens = estimateTokens(content);

      if (totalTokens + tokens > maxTokens) {
        truncated = true;
        skippedFiles++;
        continue;
      }

      const relativePath = path.relative(directory, filePath);
      contextFiles.push({ path: filePath, relativePath, content, tokens });
      totalTokens += tokens;
    } catch {
      skippedFiles++;
    }
  }

  return {
    files: contextFiles,
    totalTokens,
    totalFiles: contextFiles.length,
    skippedFiles,
    directory,
    truncated,
  };
}

export function formatContextAsSystemMessage(ctx: CodebaseContext): string {
  const lines: string[] = [
    `Project codebase context (${ctx.totalFiles} files, ~${ctx.totalTokens} tokens):`,
    `Directory: ${ctx.directory}`,
  ];

  if (ctx.truncated) {
    lines.push(`Note: Context was truncated. ${ctx.skippedFiles} files were omitted due to token budget.`);
  }

  lines.push('');

  for (const file of ctx.files) {
    const ext = path.extname(file.relativePath).slice(1) || 'txt';
    lines.push(`## ${file.relativePath}`);
    lines.push('```' + ext);
    lines.push(file.content);
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

export async function buildFileContext(filePaths: string[]): Promise<ContextFile[]> {
  const files: ContextFile[] = [];
  for (const filePath of filePaths) {
    try {
      const resolved = path.resolve(filePath);
      const content = await fs.readFile(resolved, 'utf-8');
      const tokens = estimateTokens(content);
      files.push({
        path: resolved,
        relativePath: filePath,
        content,
        tokens,
      });
    } catch (err) {
      throw new Error(`Cannot read file "${filePath}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return files;
}
