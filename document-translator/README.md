# document-translator

Watches a local folder for PDF and text files, processes each one through Claude AI, and creates an Apple Note from the result. The default prompt translates the document to Polish.

## How it works

1. Drop a file into the configured watch folder
2. Within 10 seconds the app picks it up, extracts the text, and sends it to Claude
3. An Apple Note is created in the "Translated Documents" folder
4. The original file is moved to `processed/` (or `failed/` on error)

Supported file types: `.pdf`, `.txt`, `.md`, `.html`, `.htm`, `.csv`

---

## Installation

### Requirements

- macOS (uses Apple Notes via AppleScript)
- Node.js ≥ 18 — install via [Homebrew](https://brew.sh): `brew install node`
- An [Anthropic API key](https://console.anthropic.com/)

### Steps

```bash
# 1. Clone the repository
git clone git@github.com:sergezimirev/appria.git
cd appria/document-translator

# 2. Run setup (installs dependencies, creates .env, creates watch folder)
bash scripts/setup.sh

# 3. Set your API key
open .env
# Set: ANTHROPIC_API_KEY=sk-ant-...

# 4. Start
npm start
```

---

## Configuration

All options are set via `.env` (created from `config/.env.example` by setup).

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | **required** | Your Anthropic API key |
| `WATCH_FOLDER` | `~/Documents/Translate Inbox` | Folder to watch |
| `WATCH_INTERVAL_MS` | `10000` | Poll interval in ms |
| `WATCH_EXTENSIONS` | `.pdf,.txt,.md,.html,.htm,.csv` | Comma-separated file types |
| `AI_MODEL` | `claude-haiku-4-5-20251001` | Claude model to use |
| `AI_MAX_TOKENS` | `4096` | Max tokens in Claude response |
| `TRANSLATION_PROMPT` | *(translate to Polish)* | Instruction sent to Claude |
| `NOTES_FOLDER` | `Translated Documents` | Apple Notes folder name |

### Custom prompt example

To summarize instead of translate, set in `.env`:

```
TRANSLATION_PROMPT=Summarize the following document in 5 bullet points in English.
```

---

## Running in production (auto-restart)

Uses [PM2](https://pm2.keymetrics.io/) to keep the app running after crashes or reboots.

```bash
# Install PM2 globally (once)
npm install -g pm2

# Start
npm run pm2:start

# View logs
npm run pm2:logs

# Stop
npm run pm2:stop

# Auto-start on login (run once after first pm2:start)
pm2 save
pm2 startup
```

---

## File layout

```
document-translator/
├── main.js                  # Entry point
├── config/
│   ├── config.js            # Zod-validated config loader
│   └── .env.example         # Config template
├── src/
│   ├── watcher.js           # Polls watch folder every 10s
│   ├── extractor.js         # Extracts text from PDF / text files
│   ├── processor.js         # Sends text to Claude API
│   └── notes.js             # Creates Apple Note via osascript
├── scripts/
│   └── setup.sh             # One-command installer
├── data/
│   └── processed.json       # Tracks already-processed files (auto-created)
└── logs/                    # Rotating daily logs (auto-created)
```
