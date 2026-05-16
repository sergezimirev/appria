import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import config from '../../config/config.js';
import logger from '../logging/logger.js';

fs.mkdirSync(path.dirname(config.db.path), { recursive: true });

const db = new DatabaseSync(config.db.path);

db.exec(`PRAGMA journal_mode = WAL`);
db.exec(`PRAGMA foreign_keys = ON`);

db.exec(`
  CREATE TABLE IF NOT EXISTS processed_emails (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id  TEXT    UNIQUE NOT NULL,
    subject     TEXT,
    from_addr   TEXT,
    received_at TEXT,
    processed_at TEXT   DEFAULT (datetime('now')),
    status      TEXT    DEFAULT 'pending',
    error       TEXT
  );

  CREATE TABLE IF NOT EXISTS candidates (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email_id      INTEGER REFERENCES processed_emails(id),
    first_name    TEXT,
    last_name     TEXT,
    phone         TEXT,
    email         TEXT,
    pesel         TEXT,
    citizenship   TEXT,
    job_position  TEXT,
    hourly_rate   TEXT,
    start_date    TEXT,
    notes         TEXT,
    pdf_path      TEXT,
    hrappka_id    TEXT,
    created_at    TEXT    DEFAULT (datetime('now')),
    status        TEXT    DEFAULT 'pending',
    content_hash  TEXT    UNIQUE
  );

  CREATE TABLE IF NOT EXISTS manual_review_queue (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id INTEGER REFERENCES candidates(id),
    email_id     INTEGER REFERENCES processed_emails(id),
    reason       TEXT,
    raw_data     TEXT,
    created_at   TEXT    DEFAULT (datetime('now')),
    reviewed_at  TEXT,
    status       TEXT    DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS processing_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    email_id     INTEGER REFERENCES processed_emails(id),
    candidate_id INTEGER,
    stage        TEXT,
    status       TEXT,
    detail       TEXT,
    created_at   TEXT    DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_emails_message_id  ON processed_emails(message_id);
  CREATE INDEX IF NOT EXISTS idx_emails_status      ON processed_emails(status);
  CREATE INDEX IF NOT EXISTS idx_candidates_pesel   ON candidates(pesel);
  CREATE INDEX IF NOT EXISTS idx_candidates_hash    ON candidates(content_hash);
  CREATE INDEX IF NOT EXISTS idx_review_status      ON manual_review_queue(status);
`);

logger.info('Database ready', { path: config.db.path });

const stmts = {
  emailExists:              db.prepare('SELECT id FROM processed_emails WHERE message_id = ?'),
  insertEmail:              db.prepare('INSERT INTO processed_emails (message_id, subject, from_addr, received_at, status) VALUES (?, ?, ?, ?, ?)'),
  updateEmailStatus:        db.prepare('UPDATE processed_emails SET status = ?, error = ? WHERE id = ?'),
  candidateByHash:          db.prepare('SELECT id FROM candidates WHERE content_hash = ?'),
  candidateByPesel:         db.prepare('SELECT id, first_name, last_name FROM candidates WHERE pesel = ?'),
  insertCandidate:          db.prepare('INSERT INTO candidates (email_id, first_name, last_name, phone, email, pesel, citizenship, job_position, hourly_rate, start_date, notes, pdf_path, status, content_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  updateCandidateHrappkaId: db.prepare('UPDATE candidates SET hrappka_id = ?, status = ? WHERE id = ?'),
  insertReview:             db.prepare('INSERT INTO manual_review_queue (candidate_id, email_id, reason, raw_data) VALUES (?, ?, ?, ?)'),
  insertLog:                db.prepare('INSERT INTO processing_log (email_id, candidate_id, stage, status, detail) VALUES (?, ?, ?, ?, ?)'),
  pendingReviews:           db.prepare('SELECT mrq.*, e.from_addr, e.subject FROM manual_review_queue mrq LEFT JOIN processed_emails e ON e.id = mrq.email_id WHERE mrq.status = \'pending\' ORDER BY mrq.created_at DESC'),
};

export const queries = {
  emailExists:      (messageId)  => stmts.emailExists.get(messageId),
  insertEmail:      ({ messageId, subject, fromAddr, receivedAt, status }) =>
    stmts.insertEmail.run(messageId, subject, fromAddr, receivedAt, status),
  updateEmailStatus: ({ id, status, error }) =>
    stmts.updateEmailStatus.run(status, error ?? null, id),

  candidateByHash:  (hash)  => stmts.candidateByHash.get(hash),
  candidateByPesel: (pesel) => stmts.candidateByPesel.get(pesel),
  insertCandidate:  (c) =>
    stmts.insertCandidate.run(
      c.emailId, c.firstName, c.lastName, c.phone ?? null, c.email ?? null,
      c.pesel ?? null, c.citizenship ?? null, c.jobPosition ?? null,
      c.hourlyRate ?? null, c.startDate ?? null, c.notes ?? null,
      c.pdfPath ?? null, c.status, c.contentHash
    ),
  updateCandidateHrappkaId: ({ id, hrappkaId, status }) =>
    stmts.updateCandidateHrappkaId.run(hrappkaId ?? null, status, id),

  insertReview: ({ candidateId, emailId, reason, rawData }) =>
    stmts.insertReview.run(candidateId ?? null, emailId, reason, rawData),

  pendingReviews: () => stmts.pendingReviews.all(),
};

export function logStage({ emailId, candidateId = null, stage, status, detail = null }) {
  stmts.insertLog.run(emailId, candidateId, stage, status, detail);
}

export default db;
