#!/usr/bin/env bash
set -euo pipefail

echo "=== Document Translator Setup ==="
echo ""

# ── Prerequisites ──────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || { echo "❌ Node.js not found. Install via: brew install node"; exit 1; }
NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
REQUIRED_MAJOR=18
ACTUAL_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "$ACTUAL_MAJOR" -lt "$REQUIRED_MAJOR" ]; then
  echo "❌ Node.js $NODE_VER is too old. Requires >= $REQUIRED_MAJOR. Upgrade via: brew upgrade node"
  exit 1
fi
echo "✓ Node.js $NODE_VER"

command -v npm >/dev/null 2>&1 || { echo "❌ npm not found"; exit 1; }
echo "✓ npm $(npm -v)"

command -v osascript >/dev/null 2>&1 || { echo "❌ osascript not found — this app requires macOS"; exit 1; }
echo "✓ macOS (osascript available)"

# ── Directories ────────────────────────────────────────────────────────────────
mkdir -p data logs
echo "✓ Directories created (data/, logs/)"

# ── .env setup ────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  cp config/.env.example .env
  echo ""
  echo "⚠️  .env created from example. You MUST set your API key before starting:"
  echo ""
  echo "    ANTHROPIC_API_KEY=sk-ant-..."
  echo ""
  echo "    Edit with: open .env"
  echo ""
else
  echo "✓ .env already exists"
  # Warn if API key looks unset
  if grep -q 'ANTHROPIC_API_KEY=sk-ant-\.\.\.' .env 2>/dev/null || grep -q 'ANTHROPIC_API_KEY=$' .env 2>/dev/null; then
    echo "⚠️  ANTHROPIC_API_KEY appears unset in .env — edit it before starting"
  fi
fi

# ── npm install ────────────────────────────────────────────────────────────────
echo "Installing dependencies..."
# Use a writable cache location to avoid permission issues on shared machines
npm install --cache /tmp/npm-cache-document-translator
echo "✓ Dependencies installed"

# ── PM2 (optional, for production) ────────────────────────────────────────────
if ! command -v pm2 >/dev/null 2>&1; then
  echo ""
  echo "ℹ️  PM2 not found globally. To install (needed for production auto-start):"
  echo "    npm install -g pm2"
else
  echo "✓ PM2 $(pm2 -v)"
fi

# ── Watch folder ───────────────────────────────────────────────────────────────
WATCH_FOLDER="${WATCH_FOLDER:-$HOME/Documents/Translate Inbox}"
mkdir -p "$WATCH_FOLDER" "$WATCH_FOLDER/processed" "$WATCH_FOLDER/failed"
echo "✓ Watch folder ready: $WATCH_FOLDER"

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Edit .env and set ANTHROPIC_API_KEY"
echo "  2. Start:   npm start"
echo ""
echo "  Drop any PDF or text file into:"
echo "    $WATCH_FOLDER"
echo "  A translated Apple Note will appear in the 'Translated Documents' folder."
echo ""
echo "  Production (auto-restart on crash/reboot):"
echo "    npm run pm2:start"
echo "    npm run pm2:logs"
echo ""
