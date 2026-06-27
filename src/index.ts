#!/usr/bin/env node

import { Command } from 'commander';
import updateNotifier from 'update-notifier';
import { registerChatCommand } from './commands/chat.js';
import { registerReplCommand } from './commands/repl.js';
import { registerSuggestCommand } from './commands/suggest.js';
import { registerConfigCommand, runConfigInit } from './commands/config.js';
import { formatError, getChalk } from './lib/output.js';
import { getVersion } from './lib/version.js';

try {
  const pkg = { name: 'veniceai-cli', version: getVersion() };
  updateNotifier({ pkg, updateCheckInterval: 1000 * 60 * 60 * 24 }).notify({
    isGlobal: true,
    message: 'Update available {currentVersion} → {latestVersion}\nRun {updateCommand} to update',
  });
} catch {
  // Ignore — can fail on Termux or restricted networks
}

async function main() {
  const program = new Command();
  const c = getChalk();

  program
    .name('venice')
    .version(getVersion())
    .description(
      `${c.bold('Venice CLI')} — Privacy-first AI from the command line\n\n` +
      `Chat, run an interactive REPL, or get shell command suggestions.\n` +
      `Runs natively on Termux (Android) and Linux/macOS.`
    )
    .option('--no-color', 'Disable colored output')
    .hook('preAction', (thisCommand) => {
      if (thisCommand.opts().color === false) {
        process.env.NO_COLOR = '1';
      }
    });

  registerChatCommand(program);
  registerReplCommand(program);
  registerSuggestCommand(program);
  registerConfigCommand(program);

  program
    .command('setup')
    .description('Interactive first-time setup wizard (alias for "config init")')
    .action(async () => {
      await runConfigInit();
    });

  program.exitOverride();

  try {
    await program.parseAsync(process.argv);
  } catch (error: any) {
    if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') {
      process.exit(0);
    }
    if (error.code === 'commander.unknownCommand') {
      console.error(formatError(`Unknown command: ${error.message}`));
      console.error('\nRun "venice --help" for available commands.');
      process.exit(1);
    }
    if (error.code === 'commander.missingArgument') {
      console.error(formatError(error.message));
      process.exit(1);
    }
    console.error(formatError(error.message || String(error)));
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason: any) => {
  console.error(formatError(reason?.message || String(reason)));
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n');
  process.exit(0);
});

main();
