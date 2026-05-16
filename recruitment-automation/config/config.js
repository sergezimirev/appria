import 'dotenv/config';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const schema = z.object({
  imap: z.object({
    host: z.string().min(1),
    port: z.coerce.number().default(993),
    tls: z.coerce.boolean().default(true),
    user: z.string().email(),
    password: z.string().min(1),
    mailbox: z.string().default('INBOX'),
    processedLabel: z.string().default('Processed/Recruitment'),
    filterFrom: z.string().default(''),
  }),
  ai: z.object({
    apiKey: z.string().min(1),
    model: z.string().default('claude-opus-4-7'),
    maxTokens: z.coerce.number().default(2048),
  }),
  hrappka: z.object({
    url: z.string().url(),
    email: z.string().email(),
    password: z.string().min(1),
    useKeychain: z.coerce.boolean().default(false),
  }),
  db: z.object({
    path: z.string(),
  }),
  paths: z.object({
    pdfArchive: z.string(),
    logs: z.string(),
    screenshots: z.string(),
  }),
  polling: z.object({
    intervalSeconds: z.coerce.number().default(60),
  }),
  retry: z.object({
    maxRetries: z.coerce.number().default(3),
    delayMs: z.coerce.number().default(5000),
  }),
  notes: z.object({
    folder: z.string().default('Recruitment'),
  }),
});

const raw = {
  imap: {
    host: process.env.IMAP_HOST,
    port: process.env.IMAP_PORT,
    tls: process.env.IMAP_TLS,
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASSWORD,
    mailbox: process.env.IMAP_MAILBOX,
    processedLabel: process.env.IMAP_PROCESSED_LABEL,
    filterFrom: process.env.IMAP_FILTER_FROM,
  },
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.AI_MODEL,
    maxTokens: process.env.AI_MAX_TOKENS,
  },
  hrappka: {
    url: process.env.HRAPPKA_URL,
    email: process.env.HRAPPKA_EMAIL,
    password: process.env.HRAPPKA_PASSWORD,
    useKeychain: process.env.HRAPPKA_USE_KEYCHAIN,
  },
  db: {
    path: path.resolve(ROOT, process.env.DB_PATH || './data/recruitment.db'),
  },
  paths: {
    pdfArchive: path.resolve(ROOT, process.env.PDF_ARCHIVE_DIR || './archives/pdfs'),
    logs: path.resolve(ROOT, process.env.LOG_DIR || './logs'),
    screenshots: path.resolve(ROOT, process.env.SCREENSHOTS_DIR || './logs/screenshots'),
  },
  polling: {
    intervalSeconds: process.env.EMAIL_POLL_INTERVAL,
  },
  retry: {
    maxRetries: process.env.MAX_RETRIES,
    delayMs: process.env.RETRY_DELAY_MS,
  },
  notes: {
    folder: process.env.NOTES_FOLDER,
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
