import 'dotenv/config';
import { z } from 'zod';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PROMPT_FILE = path.join(__dirname, 'prompt.txt');
const filePrompt = fs.existsSync(PROMPT_FILE) ? fs.readFileSync(PROMPT_FILE, 'utf8').trim() : undefined;

function expandHome(p) {
  if (!p) return p;
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

const schema = z.object({
  watch: z.object({
    path: z.string(),
    intervalMs: z.coerce.number().default(10000),
    extensions: z.string().default('.pdf,.txt,.md,.html,.htm,.csv'),
  }),
  ai: z.object({
    apiKey: z.string().min(1),
    model: z.string().default('claude-haiku-4-5-20251001'),
    maxTokens: z.coerce.number().default(4096),
    prompt: z.string(),
  }),
  notes: z.object({
    folder: z.string().default('Translated Documents'),
  }),
  paths: z.object({
    state: z.string(),
    logs: z.string(),
  }),
});

const raw = {
  watch: {
    path: expandHome(process.env.WATCH_FOLDER) || path.join(os.homedir(), 'Documents', 'Translate Inbox'),
    intervalMs: process.env.WATCH_INTERVAL_MS,
    extensions: process.env.WATCH_EXTENSIONS,
  },
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.AI_MODEL,
    maxTokens: process.env.AI_MAX_TOKENS,
    prompt: process.env.TRANSLATION_PROMPT || filePrompt,
  },
  notes: {
    folder: process.env.NOTES_FOLDER,
  },
  paths: {
    state: path.resolve(ROOT, process.env.STATE_FILE || './data/processed.json'),
    logs: path.resolve(ROOT, process.env.LOG_DIR || './logs'),
  },
};

let config;
try {
  config = schema.parse(raw);
} catch (err) {
  console.error('❌ Invalid configuration:', err.flatten?.().fieldErrors ?? err.message);
  process.exit(1);
}

export default config;
