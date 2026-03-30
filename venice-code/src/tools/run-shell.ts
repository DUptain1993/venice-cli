/**
 * Run shell command tool
 */

import type { Tool } from '../types/index.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const runShellTool: Tool = {
  name: 'run_shell',
  description: 'Execute a shell command and return its output. Use for running tests, builds, git commands, etc. Command runs in the current working directory.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Shell command to execute',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)',
      },
    },
    required: ['command'],
  },
  execute: async (args: { command: string; timeout?: number }): Promise<string> => {
    const { command, timeout = 30000 } = args;

    if (!command) {
      return 'Error: command is required';
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        cwd: process.cwd(),
      });

      return JSON.stringify({
        success: true,
        command,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exit_code: 0,
      });
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        command,
        stdout: error.stdout?.trim() || '',
        stderr: error.stderr?.trim() || error.message,
        exit_code: error.code || 1,
      });
    }
  },
};
