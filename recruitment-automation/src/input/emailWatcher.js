import Imap from 'imap';
import { simpleParser } from 'mailparser';
import fs from 'fs';
import path from 'path';
import config from '../../config/config.js';
import logger from '../logging/logger.js';
import { queries } from '../database/db.js';
import { sanitizeFilename } from '../utils/helpers.js';

export class EmailWatcher {
  constructor(onEmailReceived) {
    this.onEmailReceived = onEmailReceived;
    this.imap = null;
    this.isConnected = false;
  }

  connect() {
    const { host, port, tls, user, password, mailbox } = config.imap;
    this.imap = new Imap({ host, port, tls, user, password, tlsOptions: { rejectUnauthorized: false } });

    this.imap.once('ready', () => {
      logger.info('IMAP connected', { user, host });
      this.isConnected = true;
      this._openMailbox(mailbox);
    });

    this.imap.on('error', (err) => {
      logger.error('IMAP error', { err: err.message });
      this.isConnected = false;
      setTimeout(() => this.connect(), 30_000);
    });

    this.imap.once('end', () => {
      logger.warn('IMAP connection ended, reconnecting in 30s');
      this.isConnected = false;
      setTimeout(() => this.connect(), 30_000);
    });

    this.imap.connect();
  }

  _openMailbox(mailbox) {
    this.imap.openBox(mailbox, false, (err, box) => {
      if (err) {
        logger.error('Failed to open mailbox', { mailbox, err: err.message });
        return;
      }
      logger.info('Mailbox open', { mailbox, messages: box.messages.total });
      this._fetchUnread();

      // Listen for new mail without constant polling
      this.imap.on('mail', () => {
        logger.debug('New mail event received');
        this._fetchUnread();
      });
    });
  }

  _fetchUnread() {
    const criteria = ['UNSEEN'];
    const filterFrom = config.imap.filterFrom;

    const searchCriteria = filterFrom
      ? [['UNSEEN'], ['FROM', filterFrom]]
      : [['UNSEEN']];

    this.imap.search(searchCriteria, (err, uids) => {
      if (err) {
        logger.error('IMAP search failed', { err: err.message });
        return;
      }
      if (!uids.length) {
        logger.debug('No unread emails found');
        return;
      }
      logger.info(`Found ${uids.length} unread email(s)`);
      this._fetchMessages(uids);
    });
  }

  _fetchMessages(uids) {
    const fetch = this.imap.fetch(uids, { bodies: '', markSeen: false });

    fetch.on('message', (msg, seqno) => {
      let rawBuffer = [];
      let uid;

      msg.on('attributes', (attrs) => { uid = attrs.uid; });
      msg.on('body', (stream) => {
        stream.on('data', (chunk) => rawBuffer.push(chunk));
      });

      msg.once('end', async () => {
        const raw = Buffer.concat(rawBuffer);
        try {
          const parsed = await simpleParser(raw);
          await this._processEmail(parsed, uid);
        } catch (err) {
          logger.error('Failed to parse email', { uid, err: err.message });
        }
      });
    });

    fetch.once('error', (err) => logger.error('Fetch error', { err: err.message }));
  }

  async _processEmail(parsed, uid) {
    const messageId = parsed.messageId || `uid-${uid}-${Date.now()}`;
    const subject = parsed.subject || '(no subject)';
    const fromAddr = parsed.from?.text || 'unknown';
    const receivedAt = parsed.date?.toISOString() || new Date().toISOString();

    // Duplicate check
    const existing = queries.emailExists.get(messageId);
    if (existing) {
      logger.debug('Email already processed', { messageId });
      return;
    }

    // Filter: must have PDF attachment
    const pdfAttachments = (parsed.attachments || []).filter(
      (a) => a.contentType === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf')
    );

    if (!pdfAttachments.length) {
      logger.info('Email has no PDF attachments, skipping', { subject, fromAddr });
      this._markSeen(uid);
      return;
    }

    logger.info('Processing email', { messageId, subject, fromAddr, pdfs: pdfAttachments.length });

    // Insert email record
    const emailRecord = queries.insertEmail.run({
      messageId,
      subject,
      fromAddr,
      receivedAt,
      status: 'processing',
    });
    const emailId = emailRecord.lastInsertRowid;

    // Save PDFs to archive
    const savedPdfs = [];
    for (const attachment of pdfAttachments) {
      const safe = sanitizeFilename(attachment.filename || `attachment-${Date.now()}.pdf`);
      const destPath = path.join(config.paths.pdfArchive, `${emailId}_${safe}`);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, attachment.content);
      savedPdfs.push({ path: destPath, filename: attachment.filename });
      logger.info('PDF archived', { path: destPath });
    }

    // Fire callback with enriched email data
    try {
      await this.onEmailReceived({
        emailId,
        messageId,
        subject,
        fromAddr,
        receivedAt,
        pdfs: savedPdfs,
        text: parsed.text || '',
        uid,
      });
      this._markSeen(uid);
    } catch (err) {
      logger.error('Email processing pipeline failed', { emailId, err: err.message });
      queries.updateEmailStatus.run({ id: emailId, status: 'failed', error: err.message });
    }
  }

  _markSeen(uid) {
    this.imap.addFlags(uid, ['\\Seen'], (err) => {
      if (err) logger.warn('Failed to mark email as seen', { uid, err: err.message });
    });
  }

  disconnect() {
    if (this.imap) this.imap.end();
  }
}

// Standalone test
if (process.argv.includes('--test')) {
  const watcher = new EmailWatcher(async (email) => {
    console.log('TEST: received email', email.subject, 'with', email.pdfs.length, 'PDF(s)');
  });
  watcher.connect();
}
