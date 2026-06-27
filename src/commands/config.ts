/**
 * Config Command - Manage Venice CLI configuration
 */

import { Command } from 'commander';
import {
  loadConfig,
  setConfigValue,
  deleteConfigValue,
  getConfigPath,
  isTermux,
} from '../lib/config.js';
import { listModels } from '../lib/api.js';
import { formatSuccess, formatError, getChalk, startSpinner, clearSpinner } from '../lib/output.js';
import type { VeniceConfig } from '../types/index.js';

export function registerConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('Manage Venice CLI configuration')
    .action(() => {
      const cfg = loadConfig();
      const c = getChalk();

      console.log(c.bold('Venice CLI Configuration\n'));
      console.log(`${c.dim('Config file:')} ${getConfigPath()}\n`);

      const keys: Array<keyof VeniceConfig> = [
        'api_key',
        'default_model',
        'default_image_model',
        'default_voice',
        'output_format',
        'no_color',
        'show_usage',
      ];

      for (const key of keys) {
        const value = cfg[key];
        const displayValue = key === 'api_key' && value
          ? maskApiKey(value as string)
          : value ?? c.dim('(not set)');
        console.log(`  ${c.cyan(key.padEnd(20))} ${displayValue}`);
      }

      console.log(`\n${c.dim('Run "venice config --help" for available subcommands')}`);
    });

  config
    .command('show')
    .description('Show current configuration')
    .option('--format <format>', 'Output format (pretty|json)', 'pretty')
    .action((options) => {
      const cfg = loadConfig();
      const c = getChalk();

      if (options.format === 'json') {
        const maskedCfg: VeniceConfig = { ...cfg };
        if (typeof maskedCfg.api_key === 'string' && maskedCfg.api_key.length > 0) {
          maskedCfg.api_key = maskApiKey(maskedCfg.api_key);
        }
        console.log(JSON.stringify(maskedCfg, null, 2));
        return;
      }

      console.log(c.bold('Venice CLI Configuration\n'));
      console.log(`${c.dim('Config file:')} ${getConfigPath()}\n`);

      const keys: Array<keyof VeniceConfig> = [
        'api_key',
        'default_model',
        'default_image_model',
        'default_voice',
        'output_format',
        'no_color',
        'show_usage',
      ];

      for (const key of keys) {
        const value = cfg[key];
        const displayValue = key === 'api_key' && value
          ? maskApiKey(value as string)
          : value ?? c.dim('(not set)');
        console.log(`  ${c.cyan(key.padEnd(20))} ${displayValue}`);
      }

      console.log(`\n${c.dim('Tip: Use "venice config set <key> <value>" to update settings')}`);
    });

  config
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action((key: string, value: string) => {
      const validKeys: Array<keyof VeniceConfig> = [
        'api_key',
        'default_model',
        'default_image_model',
        'default_voice',
        'output_format',
        'no_color',
        'show_usage',
      ];

      if (!validKeys.includes(key as keyof VeniceConfig)) {
        console.error(formatError(
          `Invalid config key: ${key}\n\nValid keys: ${validKeys.join(', ')}`
        ));
        process.exit(1);
      }

      setConfigValue(key as keyof VeniceConfig, value);

      const displayValue = key === 'api_key' ? maskApiKey(value) : value;
      console.log(formatSuccess(`Set ${key} = ${displayValue}`));
    });

  config
    .command('get <key>')
    .description('Get a configuration value')
    .action((key: string) => {
      const cfg = loadConfig();
      const value = (cfg as any)[key];

      if (value === undefined) {
        console.log('(not set)');
      } else if (key === 'api_key') {
        console.log(maskApiKey(value));
      } else {
        console.log(value);
      }
    });

  config
    .command('unset <key>')
    .description('Remove a configuration value')
    .action((key: string) => {
      deleteConfigValue(key as keyof VeniceConfig);
      console.log(formatSuccess(`Removed ${key}`));
    });

  config
    .command('path')
    .description('Show configuration file path')
    .action(() => {
      console.log(getConfigPath());
    });

  config
    .command('init')
    .description('Initialize configuration interactively')
    .action(async () => {
      await runConfigInit();
    });
}

// Read one line from raw stdin without readline (works reliably on Termux)
function readLine(prompt: string): Promise<string> {
  return new Promise<string>((resolve) => {
    process.stdout.write(prompt);

    let buffer = '';

    const onData = (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      buffer += text;

      const nl = buffer.indexOf('\n');
      if (nl !== -1) {
        cleanup();
        resolve(buffer.slice(0, nl).replace(/\r$/, ''));
      }
    };

    const onEnd = () => {
      cleanup();
      resolve(buffer.replace(/\r?\n$/, ''));
    };

    function cleanup() {
      process.stdin.removeListener('data', onData);
      process.stdin.removeListener('end', onEnd);
      process.stdin.pause();
    }

    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    process.stdin.once('end', onEnd);
    process.stdin.on('data', onData);
  });
}

export async function runConfigInit(): Promise<void> {
  const c = getChalk();
  const onTermux = isTermux();

  console.log(c.bold('\n  Venice CLI Setup'));
  console.log(c.dim('  ' + '─'.repeat(40)));
  if (onTermux) {
    console.log(c.dim('  Termux detected — native Android environment'));
  }
  console.log(`\n  Config: ${c.dim(getConfigPath())}\n`);

  // Step 1: API key
  console.log(c.bold('Step 1: API Key'));
  console.log(c.dim('  Get yours at: https://venice.ai/settings/api\n'));

  const apiKeyInput = await readLine('  API Key: ');
  const apiKey = apiKeyInput.trim();

  if (!apiKey) {
    console.log(c.yellow('\n  No API key entered. You can set it later with:\n  venice config set api_key <your-key>\n'));
    printQuickStart(c);
    return;
  }

  setConfigValue('api_key', apiKey);
  console.log('\n' + formatSuccess('API key saved'));

  // Test connection and auto-configure models
  process.env.VENICE_API_KEY = apiKey;
  startSpinner('Testing connection...');

  let textModels: string[] = [];
  let imageModels: string[] = [];

  try {
    const models = await listModels({ showSpinner: false });
    clearSpinner();
    textModels = models.filter(m => m.type === 'text').map(m => m.id);
    imageModels = models.filter(m => m.type === 'image').map(m => m.id);
    console.log(c.green('✓') + ` Connected! Found ${textModels.length} text models, ${imageModels.length} image models.\n`);
  } catch {
    clearSpinner();
    console.log(c.yellow('  Could not connect to Venice API. Check your key and try again later.\n'));
  }

  // Auto-configure chat model
  const chatModel = textModels.includes('gemma-4-uncensored')
    ? 'gemma-4-uncensored'
    : (textModels[0] || 'gemma-4-uncensored');
  setConfigValue('default_model', chatModel);
  console.log(formatSuccess(`Default chat model: ${chatModel}`));

  // Auto-configure image model
  const imgModel = imageModels.includes('flux-2-pro')
    ? 'flux-2-pro'
    : (imageModels[0] || 'flux-2-pro');
  setConfigValue('default_image_model', imgModel);
  console.log(formatSuccess(`Default image model: ${imgModel}`));

  console.log(formatSuccess('\n  Setup complete!'));
  console.log(c.dim(`  Config saved to: ${getConfigPath()}\n`));

  printQuickStart(c);
}

function printQuickStart(c: ReturnType<typeof getChalk>): void {
  console.log(c.bold('  Quick start:'));
  console.log(`    ${c.cyan('venice chat "Hello!"')}              Chat with AI`);
  console.log(`    ${c.cyan('venice repl')}                       Interactive session`);
  console.log(`    ${c.cyan('venice suggest "find large files"')}  Shell command helper`);
  console.log(`    ${c.cyan('venice chat --codebase "review"')}   Full project context\n`);
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '...' + key.slice(-4);
}
