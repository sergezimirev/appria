#!/usr/bin/env bash
set -euo pipefail

echo "=== Recruitment Automation Setup ==="

# ── Prerequisites check ────────────────────────────────────
command -v node >/dev/null 2>&1 || { echo "❌ Node.js not found. Install via: brew install node"; exit 1; }
NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
echo "✓ Node.js $NODE_VER"

command -v npm >/dev/null 2>&1 || { echo "❌ npm not found"; exit 1; }

# ── Directory creation ─────────────────────────────────────
mkdir -p data archives/pdfs logs/screenshots

# ── .env setup ────────────────────────────────────────────
if [ ! -f .env ]; then
  cp config/.env.example .env
  echo "⚠️  Created .env from example. Edit it before starting:"
  echo "    open .env"
else
  echo "✓ .env already exists"
fi

# ── Dependencies ───────────────────────────────────────────
echo "Installing npm dependencies..."
npm install

# ── Playwright browsers ────────────────────────────────────
echo "Installing Playwright Chromium..."
npx playwright install chromium

# ── PM2 ───────────────────────────────────────────────────
if ! command -v pm2 >/dev/null 2>&1; then
  echo "Installing PM2 globally..."
  npm install -g pm2
fi
echo "✓ PM2 $(pm2 -v)"

# ── macOS Keychain (optional) ──────────────────────────────
echo ""
echo "=== Optional: Store HRappka credentials in macOS Keychain ==="
echo "Run these commands to store credentials securely:"
echo "  security add-internet-password -a YOUR_EMAIL -s app.hrappka.pl -w"
echo "  (then set HRAPPKA_USE_KEYCHAIN=true in .env)"

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Edit .env with your credentials"
echo "  2. Run: npm run db:migrate"
echo "  3. Test email: npm run test:email"
echo "  4. Test extraction: npm run test:extract"
echo "  5. Start: pm2 start ecosystem.config.cjs"
echo "  6. Monitor: pm2 logs recruitment-automation"
echo ""
