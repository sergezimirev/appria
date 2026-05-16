import 'dotenv/config';
import crypto from 'crypto';
import config from './config/config.js';
import logger from './src/logging/logger.js';
import { EmailWatcher } from './src/input/emailWatcher.js';
import { parsePdf } from './src/extraction/pdfParser.js';
import { extractCandidateData } from './src/extraction/aiExtractor.js';
import { validateCandidate } from './src/validation/validator.js';
import { HRappkaBot } from './src/automation/hrappka.js';
import { createCandidateNote } from './src/automation/appleNotes.js';
import { queries, logStage } from './src/database/db.js';
import { withRetry } from './src/utils/helpers.js';

// Shared HRappka browser instance — reused across emails
const hrappka = new HRappkaBot();

async function processEmail(emailData) {
  const { emailId, fromAddr, pdfs, text: emailText, subject } = emailData;
  logger.info('Pipeline started', { emailId, subject, pdfs: pdfs.length });

  for (const { path: pdfPath, filename } of pdfs) {
    await processPdf({ emailId, pdfPath, filename, fromAddr, emailText });
  }

  queries.updateEmailStatus.run({ id: emailId, status: 'success', error: null });
}

async function processPdf({ emailId, pdfPath, filename, fromAddr, emailText }) {
  logger.info('Processing PDF', { emailId, filename });
  logStage({ emailId, stage: 'parse', status: 'started', detail: filename });

  // ── 1. Parse PDF ─────────────────────────────────────────
  const { text, isLikelyScanned, error: parseError } = await parsePdf(pdfPath);

  if (parseError) {
    logStage({ emailId, stage: 'parse', status: 'failed', detail: parseError });
    await sendToManualReview({ emailId, reason: `PDF parse error: ${parseError}`, rawData: { pdfPath } });
    return;
  }

  if (isLikelyScanned) {
    logger.warn('Scanned PDF detected — AI will attempt OCR-based extraction');
  }

  logStage({ emailId, stage: 'parse', status: 'ok', detail: `${text.length} chars` });

  // ── 2. AI Extraction ────────────────────────────────────
  logStage({ emailId, stage: 'extract', status: 'started' });
  const { data: rawData, error: extractError } = await extractCandidateData(
    text,
    `From: ${fromAddr} | Subject: ${emailText?.slice(0, 200)}`
  );

  if (extractError || !rawData) {
    logStage({ emailId, stage: 'extract', status: 'failed', detail: extractError });
    await sendToManualReview({ emailId, reason: `AI extraction failed: ${extractError}`, rawData: { text: text.slice(0, 500) } });
    return;
  }

  logStage({ emailId, stage: 'extract', status: 'ok', detail: rawData.confidence });

  // ── 3. Validation ───────────────────────────────────────
  logStage({ emailId, stage: 'validate', status: 'started' });
  const { valid, data, errors, warnings } = validateCandidate(rawData);

  if (!valid) {
    logStage({ emailId, stage: 'validate', status: 'failed', detail: errors.join('; ') });
    await sendToManualReview({
      emailId,
      reason: `Validation failed: ${errors.join('; ')}`,
      rawData: { extracted: rawData, errors, warnings },
    });
    return;
  }

  logStage({ emailId, stage: 'validate', status: 'ok', detail: warnings.join('; ') || 'clean' });

  // ── 4. Duplicate check ──────────────────────────────────
  const contentHash = crypto
    .createHash('sha256')
    .update(`${data.pesel || ''}|${data.firstName}|${data.lastName}`)
    .digest('hex')
    .slice(0, 16);

  const existingByHash = queries.candidateByHash.get(contentHash);
  if (existingByHash) {
    logger.warn('Duplicate candidate detected, skipping', { contentHash });
    logStage({ emailId, stage: 'duplicate_check', status: 'duplicate', detail: contentHash });
    queries.updateEmailStatus.run({ id: emailId, status: 'duplicate', error: null });
    return;
  }

  if (data.pesel) {
    const existingByPesel = queries.candidateByPesel.get(data.pesel);
    if (existingByPesel) {
      logger.warn('Candidate with same PESEL already exists', { pesel: data.pesel });
      logStage({ emailId, stage: 'duplicate_check', status: 'pesel_duplicate', detail: data.pesel });
      await sendToManualReview({
        emailId,
        reason: `Duplicate PESEL: ${data.pesel} — existing record id ${existingByPesel.id}`,
        rawData: { extracted: data },
      });
      return;
    }
  }

  // ── 5. Persist candidate record ─────────────────────────
  const candidateRecord = queries.insertCandidate.run({
    emailId,
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone,
    email: data.email,
    pesel: data.pesel,
    citizenship: data.citizenship,
    jobPosition: data.jobPosition,
    hourlyRate: data.hourlyRate,
    startDate: data.startDate,
    notes: data.notes,
    pdfPath,
    status: 'processing',
    contentHash,
  });
  const candidateId = candidateRecord.lastInsertRowid;
  logger.info('Candidate record created', { candidateId });

  // ── 6. HRappka automation ───────────────────────────────
  logStage({ emailId, candidateId, stage: 'hrappka', status: 'started' });
  let hrappkaResult = { success: false };
  try {
    hrappkaResult = await hrappka.createCandidate(data, pdfPath);
    queries.updateCandidateHrappkaId.run({
      id: candidateId,
      hrappkaId: hrappkaResult.hrappkaId,
      status: 'hrappka_done',
    });
    logStage({ emailId, candidateId, stage: 'hrappka', status: 'ok', detail: hrappkaResult.hrappkaId });
  } catch (err) {
    logger.error('HRappka automation failed', { candidateId, err: err.message });
    logStage({ emailId, candidateId, stage: 'hrappka', status: 'failed', detail: err.message });
    // Non-fatal: continue to Apple Notes
  }

  // ── 7. Apple Notes ──────────────────────────────────────
  logStage({ emailId, candidateId, stage: 'apple_notes', status: 'started' });
  try {
    await createCandidateNote(data, {
      hrappkaUrl: hrappkaResult.url,
      recruiterEmail: fromAddr,
    });
    logStage({ emailId, candidateId, stage: 'apple_notes', status: 'ok' });
  } catch (err) {
    logger.error('Apple Notes failed', { candidateId, err: err.message });
    logStage({ emailId, candidateId, stage: 'apple_notes', status: 'failed', detail: err.message });
  }

  logger.info('Pipeline complete', {
    candidateId,
    name: `${data.firstName} ${data.lastName}`,
    hrappkaId: hrappkaResult.hrappkaId,
  });
}

async function sendToManualReview({ emailId, reason, rawData }) {
  logger.warn('Sending to manual review', { emailId, reason });
  queries.insertReview.run({
    candidateId: null,
    emailId,
    reason,
    rawData: JSON.stringify(rawData),
  });
  queries.updateEmailStatus.run({ id: emailId, status: 'manual_review', error: reason });
}

async function main() {
  logger.info('Recruitment automation starting', {
    node: process.version,
    env: process.env.NODE_ENV || 'production',
  });

  await hrappka.init();

  const watcher = new EmailWatcher(async (emailData) => {
    try {
      await processEmail(emailData);
    } catch (err) {
      logger.error('Unhandled pipeline error', { emailId: emailData.emailId, err: err.message, stack: err.stack });
      queries.updateEmailStatus.run({ id: emailData.emailId, status: 'failed', error: err.message });
    }
  });

  watcher.connect();
  logger.info('Watching for emails', { interval: config.polling.intervalSeconds + 's' });

  // Graceful shutdown
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      logger.info(`Received ${sig}, shutting down`);
      watcher.disconnect();
      await hrappka.close();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  logger.error('Fatal startup error', { err: err.message, stack: err.stack });
  process.exit(1);
});
