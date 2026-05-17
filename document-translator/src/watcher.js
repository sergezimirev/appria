import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import config from '../config/config.js';
import logger from './logger.js';
import { extractText } from './extractor.js';
import { processDocument } from './processor.js';
import { createNote } from './notes.js';

const EXTENSIONS = new Set(
  config.watch.extensions.split(',').map((e) => e.trim().toLowerCase())
);

export class DocumentWatcher {
  constructor() {
    this._processed = new Set();
    this._processing = new Set();
    this._interval = null;
    this._stateFile = config.paths.state;
    this._loadState();
  }

  _loadState() {
    try {
      if (fs.existsSync(this._stateFile)) {
        const data = JSON.parse(fs.readFileSync(this._stateFile, 'utf8'));
        this._processed = new Set(data);
        logger.debug('State loaded', { count: this._processed.size });
      }
    } catch {
      logger.warn('Could not load state file, starting fresh');
    }
  }

  _saveState() {
    try {
      fs.mkdirSync(path.dirname(this._stateFile), { recursive: true });
      fs.writeFileSync(this._stateFile, JSON.stringify([...this._processed]));
    } catch (err) {
      logger.error('Could not save state', { err: err.message });
    }
  }

  _fileHash(filePath) {
    const stat = fs.statSync(filePath);
    return crypto
      .createHash('sha256')
      .update(filePath + '|' + stat.size + '|' + stat.mtimeMs)
      .digest('hex')
      .slice(0, 32);
  }

  start() {
    const watchPath = config.watch.path;
    fs.mkdirSync(watchPath, { recursive: true });
    fs.mkdirSync(path.join(watchPath, 'processed'), { recursive: true });
    fs.mkdirSync(path.join(watchPath, 'failed'), { recursive: true });

    logger.info('DocumentWatcher started', {
      watchPath,
      intervalMs: config.watch.intervalMs,
      extensions: [...EXTENSIONS].join(', '),
      model: config.ai.model,
    });

    this._scan();
    this._interval = setInterval(() => this._scan(), config.watch.intervalMs);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    logger.info('DocumentWatcher stopped');
  }

  async _scan() {
    const watchPath = config.watch.path;
    let files;
    try {
      files = fs.readdirSync(watchPath).filter((f) => {
        const ext = path.extname(f).toLowerCase();
        return EXTENSIONS.has(ext);
      });
    } catch (err) {
      logger.error('Could not read watch folder', { err: err.message });
      return;
    }

    for (const filename of files) {
      const filePath = path.join(watchPath, filename);
      if (this._processing.has(filePath)) continue;

      let hash;
      try {
        hash = this._fileHash(filePath);
      } catch {
        continue; // file disappeared between readdir and stat
      }

      if (this._processed.has(hash)) continue;

      this._processing.add(filePath);
      // Process files sequentially to avoid hammering the API
      await this._processFile(filePath, filename, hash).finally(() => {
        this._processing.delete(filePath);
      });
    }
  }

  async _processFile(filePath, filename, hash) {
    logger.info('Processing file', { filename });

    const processedDir = path.join(config.watch.path, 'processed');
    const failedDir = path.join(config.watch.path, 'failed');

    try {
      const { text, error: extractError } = await extractText(filePath);
      if (extractError || !text.trim()) {
        logger.error('Extraction failed, moving to failed/', { filename, error: extractError });
        this._moveFile(filePath, failedDir, filename);
        return;
      }

      const { result, error: processError } = await processDocument(text);
      if (processError || !result.trim()) {
        logger.error('Processing failed, moving to failed/', { filename, error: processError });
        this._moveFile(filePath, failedDir, filename);
        return;
      }

      const title = path.basename(filename, path.extname(filename));
      const { success, error: noteError } = await createNote(title, result);
      if (!success) {
        logger.error('Note creation failed, moving to failed/', { filename, error: noteError });
        this._moveFile(filePath, failedDir, filename);
        return;
      }

      this._processed.add(hash);
      this._saveState();
      this._moveFile(filePath, processedDir, filename);
      logger.info('File processed successfully', { filename, noteTitle: title });
    } catch (err) {
      logger.error('Unexpected error processing file', { filename, err: err.message });
      try {
        this._moveFile(filePath, failedDir, filename);
      } catch {}
    }
  }

  _moveFile(src, destDir, filename) {
    fs.mkdirSync(destDir, { recursive: true });
    let dest = path.join(destDir, filename);
    if (fs.existsSync(dest)) {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      dest = path.join(destDir, `${base}-${Date.now()}${ext}`);
    }
    try {
      fs.renameSync(src, dest);
    } catch (err) {
      logger.warn('Could not move file', { src, dest, err: err.message });
    }
  }
}
