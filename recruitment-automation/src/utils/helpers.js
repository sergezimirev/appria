import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export function hashContent(data) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex')
    .slice(0, 16);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry(fn, { retries = 3, delayMs = 5000, label = 'operation' } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const wait = delayMs * attempt;
        console.warn(`[retry] ${label} failed (attempt ${attempt}/${retries}), retrying in ${wait}ms: ${err.message}`);
        await sleep(wait);
      }
    }
  }
  throw Object.assign(lastError, { retriesExhausted: true, label });
}

export async function runAppleScript(script) {
  const { stdout } = await execFileAsync('osascript', ['-e', script]);
  return stdout.trim();
}

export function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_\-\.]/g, '_').slice(0, 100);
}

export function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toISOString().split('T')[0];
}

export function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 9) return `+48${digits}`;
  if (digits.length === 11 && digits.startsWith('48')) return `+${digits}`;
  if (digits.startsWith('48') && digits.length === 11) return `+${digits}`;
  return phone.trim();
}

export function escapeAppleScript(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}
