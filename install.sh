#!/bin/sh
# Venice CLI — Termux-Native Install Script
# Usage: curl -fsSL https://raw.githubusercontent.com/duptain1993/venice-cli/main/install.sh | sh
# Or:    sh install.sh

set -e

PACKAGE="veniceai-cli"
BIN_NAME="venice"

log()  { printf '\033[1;34m[venice]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[venice]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[venice]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[venice]\033[0m %s\n' "$*" >&2; exit 1; }

# Detect environment
is_termux() {
  [ -n "$PREFIX" ] && echo "$PREFIX" | grep -q 'com.termux'
}

# Check Node.js version
check_node() {
  if ! command -v node >/dev/null 2>&1; then
    return 1
  fi
  NODE_VERSION=$(node -e "process.stdout.write(process.versions.node)" 2>/dev/null || echo "0.0.0")
  MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
  [ "$MAJOR" -ge 18 ]
}

# ── Install Node.js if missing ───────────────────────────────────────────────

if is_termux; then
  log "Termux detected (Android native environment)"

  if ! check_node; then
    log "Installing Node.js via pkg..."
    pkg update -y 2>/dev/null || true
    pkg install nodejs -y || die "Failed to install Node.js. Run: pkg install nodejs"
  fi

  NODE_VERSION=$(node --version)
  ok "Node.js $NODE_VERSION ready"

  # Ensure npm prefix is set to $PREFIX so global installs work in Termux
  CURRENT_PREFIX=$(npm config get prefix 2>/dev/null || echo "")
  if [ "$CURRENT_PREFIX" != "$PREFIX" ]; then
    log "Setting npm global prefix to \$PREFIX ($PREFIX)..."
    npm config set prefix "$PREFIX"
  fi

else
  log "Standard Linux/macOS environment"

  if ! check_node; then
    die "Node.js 18+ is required but not found.
Install it from: https://nodejs.org
Or via nvm: https://github.com/nvm-sh/nvm"
  fi

  NODE_VERSION=$(node --version)
  ok "Node.js $NODE_VERSION ready"
fi

# ── Install venice CLI ───────────────────────────────────────────────────────

log "Installing $PACKAGE globally..."

if is_termux; then
  npm install -g "$PACKAGE" --prefix "$PREFIX" 2>&1 || {
    warn "Global install failed. Trying with --unsafe-perm..."
    npm install -g "$PACKAGE" --prefix "$PREFIX" --unsafe-perm 2>&1 || \
      die "Installation failed. Check your internet connection and try again."
  }
else
  npm install -g "$PACKAGE" 2>&1 || {
    warn "Trying with sudo..."
    sudo npm install -g "$PACKAGE" 2>&1 || \
      die "Installation failed. Try: npm install -g $PACKAGE"
  }
fi

# ── Verify installation ──────────────────────────────────────────────────────

if command -v "$BIN_NAME" >/dev/null 2>&1; then
  VERSION=$("$BIN_NAME" --version 2>/dev/null || echo "unknown")
  ok "venice $VERSION installed successfully!"
else
  # On Termux, $PREFIX/bin may not be in PATH yet
  if is_termux && [ -x "$PREFIX/bin/$BIN_NAME" ]; then
    warn "$BIN_NAME is installed but not in PATH."
    log "Adding \$PREFIX/bin to PATH in shell config files..."

    for RC in "$HOME/.bashrc" "$HOME/.profile" "$HOME/.zshrc"; do
      if [ -f "$RC" ] || [ "$RC" = "$HOME/.bashrc" ]; then
        if ! grep -q 'PREFIX/bin' "$RC" 2>/dev/null; then
          printf '\nexport PATH="$PREFIX/bin:$PATH"\n' >> "$RC"
          log "Updated $RC"
        fi
      fi
    done

    ok "Run this to activate in current shell: export PATH=\"\$PREFIX/bin:\$PATH\""
    ok "Or restart Termux to apply permanently."
  else
    die "Installation may have failed — 'venice' command not found. Check npm global bin directory."
  fi
fi

# ── Done ─────────────────────────────────────────────────────────────────────

printf '\n'
ok "Installation complete!"
printf '\n'
printf '  Run \033[1;36mvenice setup\033[0m to configure your API key and get started.\n'
printf '\n'
printf '  Quick commands:\n'
printf '    \033[36mvenice setup\033[0m                       First-time configuration\n'
printf '    \033[36mvenice chat "Hello!"\033[0m               Chat with AI\n'
printf '    \033[36mvenice repl\033[0m                        Interactive session\n'
printf '    \033[36mvenice suggest "list big files"\033[0m    Shell command helper\n'
printf '    \033[36mvenice chat --codebase "review"\033[0m    Full project context\n'
printf '    \033[36mvenice --help\033[0m                      See all commands\n'
printf '\n'
