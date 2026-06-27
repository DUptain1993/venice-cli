import { Command } from 'commander';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as readline from 'readline';
import { chatCompletion } from '../lib/api.js';
import {
  requireApiKey,
  getDefaultModel,
  getPreferredShell,
  isTermux,
} from '../lib/config.js';
import { getChalk, formatError, startSpinner, clearSpinner } from '../lib/output.js';

const execAsync = promisify(exec);

function autoDetectPlatform(): string {
  if (isTermux()) return 'termux';
  if (process.platform === 'darwin') return 'macos';
  return 'linux';
}

function buildSuggestSystemPrompt(platform: string, shell: string): string {
  const platformNotes: Record<string, string> = {
    termux: 'For Termux (Android): use "pkg" instead of apt/apt-get. Paths are under $PREFIX (/data/data/com.termux/files/usr). Common packages: nodejs, python, git, curl, wget.',
    macos: 'For macOS: prefer brew for package management. Use open, pbcopy, pbpaste for system integration.',
    linux: 'For Linux: use apt, yum, or the appropriate package manager. Standard GNU tools are available.',
  };

  return `You are a ${shell} shell expert for ${platform}.
The user will describe a task. Respond with ONLY a single valid shell command that accomplishes it.
No explanation. No markdown. No backticks. No preamble. Just the raw shell command on one line.
If multiple steps are needed, chain with && or use semicolons.
${platformNotes[platform] ?? ''}
If the task is unclear or requires clarification, respond with a comment starting with "# " explaining what information is needed.`;
}

export function registerSuggestCommand(program: Command): void {
  program
    .command('suggest <description...>')
    .description('Suggest a shell command for a task (like gh copilot suggest)')
    .option('-m, --model <model>', 'Model to use')
    .option('--shell <shell>', 'Target shell (bash|zsh|fish|sh)')
    .option('--platform <platform>', 'Target platform (linux|macos|termux)')
    .option('--execute', 'Execute the suggested command after confirmation')
    .action(async (descriptionParts: string[], options) => {
      const c = getChalk();

      requireApiKey();

      const description = descriptionParts.join(' ');
      const model = options.model ?? getDefaultModel();
      const shell = options.shell ?? getPreferredShell();
      const platform = options.platform ?? autoDetectPlatform();

      startSpinner('Getting suggestion...');

      let suggestion: string;
      try {
        const response = await chatCompletion(
          [{ role: 'user', content: description }],
          {
            model,
            system: buildSuggestSystemPrompt(platform, shell),
          } as Parameters<typeof chatCompletion>[1]
        );
        clearSpinner();
        // Strip accidental backticks or markdown fences
        suggestion = response.content
          .trim()
          .replace(/^```[a-z]*\n?/i, '')
          .replace(/\n?```$/i, '')
          .trim();
      } catch (err) {
        clearSpinner();
        console.error(formatError(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }

      if (suggestion.startsWith('# ')) {
        // Model couldn't produce a command — show the note
        console.log(c.yellow(suggestion));
        return;
      }

      console.log('\n' + c.bold('Suggested command:'));
      console.log(c.cyan(suggestion));

      if (options.execute) {
        console.log('');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>(resolve => {
          rl.question(c.yellow('Run this command? [y/N] '), resolve);
        });
        rl.close();

        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          console.log('');
          try {
            const { stdout, stderr } = await execAsync(suggestion, {
              cwd: process.cwd(),
              timeout: 60000,
            });
            if (stdout) process.stdout.write(stdout);
            if (stderr) process.stderr.write(stderr);
          } catch (err: any) {
            if (err.stdout) process.stdout.write(err.stdout);
            if (err.stderr) process.stderr.write(err.stderr);
            console.error(c.red(`\nCommand exited with code ${err.code ?? 1}`));
            process.exit(err.code ?? 1);
          }
        } else {
          console.log(c.dim('Command not executed.'));
        }
      }
    });
}
