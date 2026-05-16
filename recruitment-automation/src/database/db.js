import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import config from '../../config/config.js';
import logger from '../logging/logger.js';

fs.mkdirSync(path.dirname(config.db.path), { recursive: true });

const db = new Database(config.db.path);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email_id    INTEGER REFERENCES processed_emails(id),
    candidate_id INTEGER,
    stage       TEXT,
    status      TEXT,
    detail      TEXT,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_emails_message_id  ON processed_emails(message_id);
  CREATE INDEX IF NOT EXISTS idx_emails_status      ON processed_emails(status);
  CREATE INDEX IF NOT EXISTS idx_candidates_pesel   ON candidates(pesel);
  CREATE INDEX IF NOT EXISTS idx_candidates_hash    ON candidates(content_hash);
  CREATE INDEX IF NOT EXISTS idx_review_status      ON manual_review_queue(status);
`);

logger.info('Database ready', { path: config.db.path });

export const queries = {
  emailExists: db.prepare('SELECT id FROM processed_emails WHERE message_id = ?'),
  insertEmail: db.prepare(`
    INSERT INTO processed_emails (message_id, subject, from_addr, received_at, status)
    VALUES (@messageId, @subject, @fromAddr, @receivedAt, @status)
  `),
  updateEmailStatus: db.prepare(`
    UPDATE processed_emails SET status = @status, error = @error WHERE id = @id
  `),

  candidateByHash: db.prepare('SELECT id FROM candidates WHERE content_hash = ?'),
  candidateByPesel: db.prepare('SELECT id, first_name, last_name FROM candidates WHERE pesel = ?'),
  insertCandidate: db.prepare(`
    INSERT INTO candidates
      (email_id, first_name, last_name, phone, email, pesel, citizenship,
       job_position, hourly_rate, start_date, notes, pdf_path, status, content_hash)
    VALUES
      (@emailId, @firstName, @lastName, @phone, @email, @pesel, @citizenship,
       @jobPosition, @hourlyRate, @startDate, @notes, @pdfPath, @status, @contentHash)
  `),
  updateCandidateHrappkaId: db.prepare(`
    UPDATE candidates SET hrappka_id = @hrappkaId, status = @status WHERE id = @id
  `),

  insertReview: db.prepare(`
    INSERT INTO manual_review_queue (candidate_id, email_id, reason, raw_data)
    VALUES (@candidateId, @emailId, @reason, @rawData)
  `),

  insertLog: db.prepare(`
    INSERT INTO processing_log (email_id, candidate_id, stage, status, detail)
    VALUES (@emailId, @candidateId, @stage, @status, @detail)
  `),

  pendingReviews: db.prepare(`
    SELECT mrq.*, e.from_addr, e.subject
    FROM manual_review_queue mrq
    LEFT JOIN processed_emails e ON e.id = mrq.email_id
    WHERE mrq.status = 'pending'
    ORDER BY mrq.created_at DESC
  `),
};

export function logStage({ emailId, candidateId = null, stage, status, detail = null }) {
  queries.insertLog.run({ emailId, candidateId, stage, status, detail });
}

export default db;
