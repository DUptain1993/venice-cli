# Venice CLI

> Privacy-first AI from the command line. No browser. No tracking. Just you and the model.

[![npm version](https://badge.fury.io/js/veniceai-cli.svg)](https://www.npmjs.com/package/veniceai-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The official command-line interface for [Venice AI](https://venice.ai). Chat with AI models, generate images, convert text to speech, transcribe audio, and more — all from your terminal. Full codebase context, agentic file tools, and an interactive REPL make it as capable as GitHub Copilot CLI and Gemini CLI.

## Installation

### Termux (Android) — one-liner

```bash
curl -fsSL https://raw.githubusercontent.com/DUptain1993/venice-cli/main/install.sh | sh
```

The installer automatically:
- Detects Termux and installs Node.js via `pkg` if needed
- Fixes npm global prefix to `$PREFIX`
- Adds `$PREFIX/bin` to your PATH

### Linux / macOS

```bash
npm install -g veniceai-cli
```

Or use without installing:

```bash
npx veniceai-cli chat 'Hello, world!'
```

## Quick Start

1. **Get your API key** from [Venice AI Settings](https://venice.ai/settings/api)

2. **Run the setup wizard**:
   ```bash
   venice setup
   ```
   This tests your connection, shows your available models by number, and saves everything to `~/.venice/config.json`.

   Or set the key manually:
   ```bash
   venice config set api_key YOUR_API_KEY
   # or via env var:
   export VENICE_API_KEY=YOUR_API_KEY
   ```

3. **Start chatting**:
   ```bash
   venice chat "What is the meaning of life?"
   ```

4. **Launch the interactive REPL** for a full session with file tools:
   ```bash
   venice repl
   ```

## Features

- 🤖 **Chat** with state-of-the-art AI models
- 🖥️ **Interactive REPL** with persistent conversation and file tools
- 📁 **Full Codebase Context** — load your entire project into AI context
- 🔧 **Agentic File Tools** — read, write, edit, search, delete files and run shell commands
- 💡 **Shell Suggestions** — describe a task, get the right command (Termux-aware)
- 📱 **Termux Native** — plug-and-play on Android with one-liner install
- 🔐 **End-to-End Encryption (E2EE)** for maximum privacy
- 🛡️ **TEE Attestation** verification for trusted execution
- 🔍 **Web Search** with AI-powered synthesis
- 🖼️ **Image Generation** from text prompts
- 🔊 **Text-to-Speech** with 35+ voices across languages
- 🎤 **Speech-to-Text** transcription with timestamps
- 🎬 **Video Generation** (text-to-video, image-to-video)
- 📐 **Embeddings** generation
- 🎭 **Character Personas** for fun interactions
- 💾 **Conversation History** with continue mode
- 📊 **Usage Tracking** for token monitoring
- 🐚 **Shell Completions** for bash, zsh, fish

## Commands

### Chat

```bash
# Basic chat
venice chat "Explain quantum computing in simple terms"

# Use a specific model
venice chat -m deepseek-v3.2 "Solve this step by step: 15% of 340"

# With a system prompt
venice chat -s "You are a helpful coding assistant" "Write a fizzbuzz in Python"

# Use a character persona
venice chat -c pirate "Tell me about the weather"

# Continue the previous conversation
venice chat --continue "What about the next step?"

# With function calling
venice chat -t calculator,weather "What's 25 * 4.5?"

# JSON output for scripting
venice chat -f json "List 3 colors" | jq '.content'

# ── Codebase & file context ──────────────────────────────────────────────────

# Load your entire project into context
venice chat --codebase "Summarize this codebase and identify potential improvements"

# Load context from a specific directory
venice chat --codebase ./src "Explain the architecture of the source files"

# Load specific files
venice chat --file src/index.ts src/lib/api.ts "What does this code do?"

# ── Agent mode (AI can read/write/run files) ─────────────────────────────────

# Enable file + shell tools
venice chat --agent "Find all TODO comments in the codebase and create a summary"

# Skip confirmation prompts
venice chat --agent --auto-approve "Fix the TypeScript errors in src/commands/chat.ts"

# ── Privacy & encryption ─────────────────────────────────────────────────────

# E2EE encrypted chat (auto-enabled based on model capabilities)
venice chat -m e2ee-qwen3-5-122b-a10b "This message is end-to-end encrypted"

# TEE-only mode (attestation verified, no encryption)
venice chat -m e2ee-qwen3-5-122b-a10b --no-e2ee "Verified but not encrypted"

# Show TEE attestation details
venice chat -m e2ee-qwen3-5-122b-a10b --tee-verify "Verify the secure enclave"

# Quiet mode - E2EE without status messages (looks like normal chat)
venice chat -m e2ee-qwen3-5-122b-a10b -q "This is encrypted but looks like normal chat"
```

**Options:**

| Option | Description |
|--------|-------------|
| `-m, --model <model>` | Model to use (default: kimi-k2-5) |
| `-s, --system <prompt>` | System prompt |
| `-c, --character <name>` | Character persona |
| `-t, --tools <tools>` | Comma-separated list of tools |
| `--interactive-tools` | Approve each tool call |
| `--continue` | Continue last conversation |
| `--no-stream` | Disable streaming output |
| `--web-search` | Enable web search for current information |
| `--no-thinking` | Disable reasoning on reasoning models |
| `--strip-thinking` | Strip thinking blocks from response |
| `--no-venice-prompt` | Disable Venice system prompts |
| `--search-results-in-stream` | Include search results in stream |
| `--file <paths...>` | Load specific files into context |
| `--codebase [dir]` | Load entire codebase into context |
| `--codebase-tokens <n>` | Token budget for codebase (default: 80000) |
| `--agent` | Enable all file + shell tools |
| `--auto-approve` | Auto-approve all tool calls without prompting |
| `--e2ee` | Enable E2EE encryption (auto-enabled for models with E2EE capability) |
| `--no-e2ee` | Disable E2EE, use TEE-only mode |
| `--tee-verify` | Show TEE attestation details |
| `-q, --quiet` | Hide E2EE/TEE status messages (show only response) |
| `-f, --format <format>` | Output format (pretty\|json\|markdown\|raw) |

---

### REPL (Interactive Session)

The REPL provides a persistent, multi-turn conversation with full file system access — like having a coding assistant always available.

```bash
# Start the REPL
venice repl

# Start with a model
venice repl -m llama-3.3-70b

# Load your project into context at startup
venice repl --codebase

# Load a specific directory
venice repl --codebase --codebase-dir ./src

# Skip tool approval prompts
venice repl --auto-approve
```

**Slash commands inside the REPL:**

| Command | Description |
|---------|-------------|
| `/help` | Show all available commands |
| `/exit` or `/quit` | Exit the REPL |
| `/clear` | Clear conversation history (keep context) |
| `/model [name]` | Show current model or switch to a new one |
| `/files [dir]` | Load codebase from a directory into context |
| `/file <path>` | Load a specific file into context |
| `/tools [on\|off]` | List tools or enable/disable them |
| `/approve` | Toggle auto-approve for tool calls |
| `/history` | Show recent conversation messages |
| `/save [filename]` | Save conversation to a JSON file |

**Example session:**

```
venice> /files ./src
✓ Loaded 12 files (~8400 tokens)

venice> what does the chat command do?
The chat command handles... [AI explains]

venice> /model llama-3.3-70b
Model switched to: llama-3.3-70b

venice> write a test for the config module
[AI writes the test, calling write_file with your approval]

venice> /exit
Goodbye!
```

**Options:**

| Option | Description |
|--------|-------------|
| `-m, --model <model>` | Model to use |
| `-s, --system <prompt>` | Additional system prompt |
| `--codebase` | Load codebase into context at startup |
| `--codebase-dir <dir>` | Directory for codebase context |
| `--auto-approve` | Auto-approve all tool calls |
| `--max-tokens <n>` | Token budget for codebase context |
| `--no-tools` | Disable file system and shell tools |
| `-t, --tools <tools>` | Additional tools to enable |

---

### Shell Suggestions

Get shell commands by describing what you want — Termux-aware, platform-specific.

```bash
# Get a shell command suggestion
venice suggest "recursively find all TypeScript files modified today"

# Termux-specific suggestions
venice suggest "install the requests library" --platform termux
# → pkg install python && pip install requests

# Run the suggested command immediately
venice suggest "show disk usage sorted by size" --execute

# Target a specific shell
venice suggest "loop over all JSON files" --shell zsh
```

**Options:**

| Option | Description |
|--------|-------------|
| `-m, --model <model>` | Model to use |
| `--shell <shell>` | Target shell: bash, zsh, fish, sh |
| `--platform <platform>` | Target platform: linux, macos, termux |
| `--execute` | Run the suggested command after confirmation |

---

### Setup Wizard

First-time setup with live model selection:

```bash
venice setup
# or equivalently:
venice config init
```

The wizard:
1. Prompts for your API key and tests the connection
2. Fetches your available models and shows a numbered list to pick from
3. Sets your default image model
4. Configures preferences (usage display, colors)
5. Prints quick-start commands

---

### Web Search

```bash
# Search with AI synthesis
venice search "Latest developments in fusion energy"

# Limit results
venice search -n 10 "Best practices for TypeScript"

# Include citations in response
venice search --citations "Latest AI news"

# Enable deep web scraping
venice search --scrape "Company research on Anthropic"
```

### Image Generation

```bash
# Generate an image
venice image "A serene mountain lake at sunset"

# Save to a file
venice image -o sunset.png "A serene mountain lake at sunset"

# Custom dimensions
venice image -w 1024 -h 768 "Landscape photograph"

# Use a specific model
venice image -m flux-1-dev "Artistic portrait"
```

### Image Upscaling

```bash
# Upscale an image
venice upscale photo.jpg -o photo_upscaled.jpg

# 4x upscale
venice upscale photo.jpg -s 4 -o photo_4x.jpg
```

### Text-to-Speech

```bash
# Generate speech
venice tts "Hello, world!"

# Custom voice and output
venice tts -v bf_emma -o greeting.mp3 "Good morning, everyone!"

# From stdin
echo "Text to speak" | venice tts -o output.mp3
```

### Transcription (Speech-to-Text)

```bash
# Transcribe audio
venice transcribe recording.mp3

# With word/segment timestamps
venice transcribe -t recording.mp3

# Use a specific model (Whisper or Parakeet)
venice transcribe -m openai/whisper-large-v3 interview.wav

# With language hint
venice transcribe -l es spanish_audio.mp3

# JSON output
venice transcribe -f json interview.wav
```

**Available STT Models:**
- `nvidia/parakeet-tdt-0.6b-v3` (default, fast)
- `openai/whisper-large-v3`

### Video Generation

Venice supports AI video generation using state-of-the-art models. Video generation is asynchronous (queue-based).

```bash
# Queue a text-to-video generation
venice video generate "A cat playing with a ball in slow motion"

# Use a specific model
venice video generate -m veo3-fast-text-to-video "Cinematic sunset over mountains"

# Image-to-video with reference image
venice video generate -m wan-2.6-image-to-video -i photo.jpg "The scene comes alive"

# Set duration and aspect ratio
venice video generate -d 10s -a 16:9 "A peaceful forest scene"

# Check status of a video job
venice video status <queue_id>

# Wait for completion (polls every 5s)
venice video status -w <queue_id>

# Download completed video
venice video retrieve <queue_id> -o my_video.mp4

# List available video models
venice video models
```

**Available Video Models:**
- **Wan 2.6**: `wan-2.6-text-to-video`, `wan-2.6-image-to-video`
- **Veo3**: `veo3-fast-text-to-video`, `veo3-fast-image-to-video`
- **Sora2**: `sora2-text-to-video`, `sora2-image-to-video`
- **Kling V3**: `kling-v3-pro-text-to-video`, `kling-v3-pro-image-to-video`
- **Grok Imagine**: `grok-imagine-text-to-video`, `grok-imagine-image-to-video`
- **LTX2**: `ltx2-fast-text-to-video`, `ltx2-fast-image-to-video`

### TEE Attestation

Venice supports Trusted Execution Environment (TEE) attestation for models running in secure enclaves. This provides cryptographic proof that your data is processed in a trusted environment.

```bash
# Fetch and display TEE attestation for a model
venice tee attestation tee-qwen3-5-122b-a10b

# With verbose TDX quote details
venice tee attestation --verbose tee-qwen3-5-122b-a10b

# Run TEE attestation policy verification
venice tee verify tee-qwen3-5-122b-a10b

# Verify a response signature (requires completion ID from a previous request)
venice tee signature e2ee-qwen3-5-122b-a10b <completion-id>

# Verify signature matches expected signer address
venice tee signature e2ee-qwen3-5-122b-a10b <completion-id> --verify-signer 0x123...
```

**TEE Commands:**

| Command | Description |
|---------|-------------|
| `attestation <model>` | Fetch and display TEE attestation report |
| `verify <model>` | Run TEE attestation policy verification |
| `signature <model> <id>` | Fetch and verify TEE response signature |

### Models

```bash
# List all models
venice models

# Filter by type
venice models -t image
venice models -t audio

# Show only privacy-preserving models
venice models --privacy

# Show TEE-attestable models
venice models --tee

# Show E2EE-capable models
venice models --e2ee

# Search models
venice models -s llama
```

### Embeddings

```bash
# Generate embeddings
venice embeddings "Text to embed"

# Save to file
venice embeddings -o vectors.json "Text to embed"
```

### Configuration

```bash
# Recommended: interactive setup wizard
venice setup

# Or: interactive setup via config subcommand
venice config init

# Show current config
venice config show

# Set values
venice config set api_key YOUR_KEY
venice config set default_model kimi-k2-5
venice config set default_voice af_sky

# Get a value
venice config get default_model

# Remove a value
venice config unset default_model

# Show config file path
venice config path
```

**Available config keys:**

| Key | Description |
|-----|-------------|
| `api_key` | Your Venice API key |
| `default_model` | Default chat model |
| `default_image_model` | Default image generation model |
| `default_voice` | Default TTS voice |
| `output_format` | Default output format |
| `no_color` | Disable colored output |
| `show_usage` | Show token usage after requests |
| `auto_approve` | Auto-approve tool calls without prompting |
| `max_context_tokens` | Token budget for `--codebase` (default: 80000) |
| `shell` | Preferred shell for `venice suggest` |

### Conversation History

```bash
# List recent conversations
venice history list

# Show a specific conversation
venice history show

# Clear all history
venice history clear

# Export history
venice history export history.json
```

### Usage Statistics

```bash
# Show last 7 days
venice usage

# Show today only
venice usage --today

# Show this month
venice usage --month

# Custom range
venice usage -d 30
```

### Characters

```bash
# List available characters
venice characters

# Use a character
venice chat -c wizard "What is the nature of magic?"
```

Available characters: `pirate`, `wizard`, `scientist`, `poet`, `coder`, `teacher`, `comedian`, `philosopher`

### Voices

```bash
# List available TTS voices
venice voices
```

### Shell Completions

```bash
# Bash
venice completions bash >> ~/.bashrc

# Zsh
venice completions zsh >> ~/.zshrc

# Fish
venice completions fish > ~/.config/fish/completions/venice.fish
```

---

## Built-in Tools

The CLI includes built-in tools for function calling. Use them with `--tools` or enable all file/shell tools at once with `--agent`.

| Tool | Description |
|------|-------------|
| `calculator` | Mathematical calculations |
| `weather` | Weather information (simulated) |
| `datetime` | Current date and time |
| `random` | Random number/choice generation |
| `base64` | Base64 encoding/decoding |
| `hash` | Hash generation (md5, sha256, etc.) |
| `read_file` | Read file contents (supports offset/limit, max 1MB) |
| `write_file` | Write or overwrite a file (creates parent dirs) |
| `list_files` | List directory recursively with glob filter |
| `search_files` | Regex search across files, returns file + line + match |
| `delete_file` | Delete a file (requires `confirm: true`) |
| `run_shell` | Execute a shell command, returns stdout/stderr/exit code |

> **Safety:** `write_file`, `delete_file`, and `run_shell` always prompt for approval unless `--auto-approve` is set.

```bash
# Use individual tools
venice chat -t calculator "What's the square root of 144?"
venice chat -t datetime "What day is it today?"

# Approve each tool call interactively
venice chat --interactive-tools -t calculator "Calculate 15% tip on $85"

# Agent mode: enable all file + shell tools
venice chat --agent "Find all TODO comments and create a TASKS.md"

# Agent mode with auto-approve (no prompts)
venice chat --agent --auto-approve "Add JSDoc comments to all exported functions in src/lib/"

# Load the codebase and ask questions
venice chat --codebase "What is the entry point of this application?"
venice chat --codebase ./src "Which files would I need to change to add a new command?"
```

---

## Output Formats

| Format | Description | Use Case |
|--------|-------------|----------|
| `pretty` | Colored, formatted (default) | Interactive use |
| `json` | Machine-readable JSON | Scripting, piping |
| `markdown` | Markdown formatted | Documentation |
| `raw` | Plain text, no decoration | Pipes, simple output |

The CLI automatically detects when output is being piped and switches to `raw` format.

```bash
# Explicit format
venice chat -f json "List items" | jq '.'

# Auto-detected raw format when piped
venice chat "Generate code" | pbcopy
```

---

## Termux (Android)

Venice CLI runs natively on Android via [Termux](https://termux.dev) with no extra configuration needed.

```bash
# One-liner install (installs Node.js via pkg if needed):
curl -fsSL https://raw.githubusercontent.com/DUptain1993/venice-cli/main/install.sh | sh

# First-time setup:
venice setup

# Start an interactive session with file tools:
venice repl
```

The installer handles:
- Detecting Termux and running `pkg install nodejs` if Node.js is missing
- Setting the npm global prefix to `$PREFIX` so `venice` is in your PATH
- Adding `$PREFIX/bin` to `~/.bashrc` and `~/.profile` if needed

**Termux-aware suggestions:** `venice suggest` automatically detects Termux and produces Android-appropriate commands:

```bash
venice suggest "install python"
# → pkg install python

venice suggest "update all packages"
# → pkg update && pkg upgrade
```

---

## Privacy

Venice CLI is designed with privacy in mind:

- **End-to-End Encryption (E2EE)**: Messages encrypted client-side, decrypted only in the TEE — Venice cannot read your data
- **TEE Attestation**: Cryptographically verify that models run in secure enclaves before sending data
- **No browser tracking**: Terminal interactions don't expose browser metadata
- **No telemetry**: The CLI doesn't collect or send usage data
- **Local configuration**: API key stored locally with restricted permissions (mode `0o600`)
- **Transparent**: You can see exactly what's being sent to the API
- **Privacy-preserving models**: Use `venice models --privacy` to find models with no data retention

### E2EE Models

E2EE models provide the highest level of privacy. The CLI automatically detects E2EE support via model capabilities (not model names). When using an E2EE-capable model:

1. The CLI fetches and verifies TEE attestation
2. An ephemeral key pair is generated for the session
3. All messages are encrypted client-side using ECDH + AES-GCM
4. Only the TEE enclave can decrypt and process your data
5. Responses are encrypted and decrypted client-side

```bash
# List E2EE-capable models
venice models --e2ee

# Chat with E2EE (auto-enabled based on model capabilities)
venice chat -m <e2ee-capable-model> "Your private message here"

# TEE-only mode: verify attestation without encryption
venice chat -m <e2ee-capable-model> --no-e2ee "TEE verified, not encrypted"
```

**Note:** E2EE mode disables tools and web search to maintain end-to-end encryption.

### TEE Models

TEE (Trusted Execution Environment) models run in secure enclaves with cryptographic attestation. The CLI automatically verifies attestation for models with TEE support.

```bash
# List TEE-capable models
venice models --tee

# Chat with TEE attestation verification
venice chat -m <tee-capable-model> "Verified secure execution"
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VENICE_API_KEY` | API key (overrides config file) |
| `NO_COLOR` | Disable colored output |

---

## Requirements

- Node.js 18.0.0 or higher
- A Venice AI API key ([get one here](https://venice.ai/settings/api))

---

## Development

```bash
# Clone the repo
git clone https://github.com/veniceai/venice-cli.git
cd venice-cli

# Install dependencies
npm install

# Build
npm run build

# Run locally
npm run dev -- chat "Hello"

# Run the REPL locally
npm run dev -- repl
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT © Venice AI

---

Made with ❤️ for privacy-conscious developers.
