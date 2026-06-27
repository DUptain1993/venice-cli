/**
 * Config Command - Manage Venice CLI configuration
 */

import { Command } from 'commander';
import * as readline from 'readline';
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
      // Default to showing config
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

  // Show all config
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

  // Set a config value
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

  // Get a config value
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

  // Unset a config value
  config
    .command('unset <key>')
    .description('Remove a configuration value')
    .action((key: string) => {
      deleteConfigValue(key as keyof VeniceConfig);
      console.log(formatSuccess(`Removed ${key}`));
    });

  // Show config path
  config
    .command('path')
    .description('Show configuration file path')
    .action(() => {
      console.log(getConfigPath());
    });

  // Initialize config
  config
    .command('init')
    .description('Initialize configuration interactively')
    .action(async () => {
      await runConfigInit();
    });
}

export async function runConfigInit(): Promise<void> {
  const c = getChalk();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = (prompt: string): Promise<string> =>
    new Promise(resolve => rl.question(prompt, resolve));

  const onTermux = isTermux();

  console.log(c.bold('\n  Venice CLI Setup'));
  console.log(c.dim('  ' + '─'.repeat(40)));
  if (onTermux) {
    console.log(c.dim('  Termux detected — native Android environment'));
  }
  console.log(`\n  Config: ${c.dim(getConfigPath())}\n`);

  try {
    // Step 1: API key
    console.log(c.bold('Step 1/4: API Key'));
    console.log(c.dim('  Get yours at: https://venice.ai/settings/api\n'));
    const apiKeyInput = await question('  API Key: ');
    const apiKey = apiKeyInput.trim();

    if (!apiKey) {
      console.log(c.yellow('\n  No API key entered. You can set it later with:\n  venice config set api_key <your-key>\n'));
    } else {
      setConfigValue('api_key', apiKey);
      console.log(formatSuccess('API key saved'));

      // Test connection
      process.env.VENICE_API_KEY = apiKey;
      startSpinner('Testing connection...');
      let textModels: string[] = [];
      let imageModels: string[] = [];
      try {
        const models = await listModels();
        clearSpinner();
        textModels = models.filter(m => m.type === 'text').map(m => m.id);
        imageModels = models.filter(m => m.type === 'image').map(m => m.id);
        console.log(c.green('✓') + ` Connected! Found ${textModels.length} text models and ${imageModels.length} image models.\n`);
      } catch {
        clearSpinner();
        console.log(c.yellow('  Could not connect to Venice API. Check your key and try again later.\n'));
      }

      // Step 2: Default chat model
      console.log(c.bold('Step 2/4: Default Chat Model'));
      if (textModels.length > 0) {
        const displayModels = textModels.slice(0, 8);
        displayModels.forEach((m, i) => console.log(`    ${c.dim(`${i + 1}.`)} ${m}`));
        const choice = await question(`\n  Choice [1-${displayModels.length}] or model name [kimi-k2-5]: `);
        const trimmed = choice.trim();
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= displayModels.length) {
          setConfigValue('default_model', displayModels[num - 1]);
          console.log(formatSuccess(`Default model: ${displayModels[num - 1]}`));
        } else if (trimmed) {
          setConfigValue('default_model', trimmed);
          console.log(formatSuccess(`Default model: ${trimmed}`));
        } else {
          console.log(c.dim('  Using default: kimi-k2-5'));
        }
      } else {
        const model = await question('  Default chat model [kimi-k2-5]: ');
        if (model.trim()) setConfigValue('default_model', model.trim());
      }
      console.log('');

      // Step 3: Default image model
      console.log(c.bold('Step 3/4: Default Image Model'));
      if (imageModels.length > 0) {
        const displayImg = imageModels.slice(0, 6);
        displayImg.forEach((m, i) => console.log(`    ${c.dim(`${i + 1}.`)} ${m}`));
        const choice = await question(`\n  Choice [1-${displayImg.length}] or model name [flux-2-pro]: `);
        const trimmed = choice.trim();
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= displayImg.length) {
          setConfigValue('default_image_model', displayImg[num - 1]);
          console.log(formatSuccess(`Default image model: ${displayImg[num - 1]}`));
        } else if (trimmed) {
          setConfigValue('default_image_model', trimmed);
          console.log(formatSuccess(`Default image model: ${trimmed}`));
        } else {
          console.log(c.dim('  Using default: flux-2-pro'));
        }
      } else {
        const imgModel = await question('  Default image model [flux-2-pro]: ');
        if (imgModel.trim()) setConfigValue('default_image_model', imgModel.trim());
      }
      console.log('');
    }

    // Step 4: Preferences
    console.log(c.bold('Step 4/4: Preferences'));
    const showUsage = await question('  Show token usage after responses? [Y/n]: ');
    if (showUsage.trim().toLowerCase() === 'n') {
      setConfigValue('show_usage', 'false');
    }

    const colors = await question('  Enable color output? [Y/n]: ');
    if (colors.trim().toLowerCase() === 'n') {
      setConfigValue('no_color', 'true');
    }

    console.log(formatSuccess('\n  Setup complete!'));
    console.log(c.dim(`  Config saved to: ${getConfigPath()}\n`));
    console.log(c.bold('  Quick start:'));
    console.log(`    ${c.cyan('venice chat "Hello!"')}              Chat with AI`);
    console.log(`    ${c.cyan('venice repl')}                       Interactive session`);
    console.log(`    ${c.cyan('venice suggest "find large files"')}  Shell command helper`);
    console.log(`    ${c.cyan('venice chat --codebase "review"')}   Full project context`);
    console.log(`    ${c.cyan('venice image "a sunset"')}           Generate image\n`);
  } finally {
    rl.close();
  }
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '...' + key.slice(-4);
}
