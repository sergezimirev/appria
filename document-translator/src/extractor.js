import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import logger from './logger.js';

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.html', '.htm', '.csv', '.json', '.xml']);

export async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    return extractPdf(filePath);
  }

  // Known text formats and unknown extensions — all treated as utf-8 text
  return extractPlainText(filePath);
}

const PDF_ATTEMPTS = [
  { version: 'v2.0.550' },
  { version: 'v1.10.100' },
  {},
];

async function extractPdf(filePath) {
  const buffer = fs.readFileSync(filePath);
  const file = path.basename(filePath);
  let lastErr;

  for (const opts of PDF_ATTEMPTS) {
    try {
      const data = await pdfParse(buffer, opts);
      const text = data.text?.trim() || '';
      logger.info('PDF extracted', { file, chars: text.length, pages: data.numpages, opts });
      if (text.length < 20) {
        logger.warn('PDF text very short — may be a scanned image', { file });
      }
      return { text, error: null };
    } catch (err) {
      logger.warn('PDF parse attempt failed, retrying with different options', { file, opts, err: err.message });
      lastErr = err;
    }
  }

  logger.error('PDF extraction failed after all attempts', { file, err: lastErr.message });
  return { text: '', error: lastErr.message };
}

function extractPlainText(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    logger.info('Text extracted', { file: path.basename(filePath), chars: text.length });
    return { text, error: null };
  } catch (err) {
    logger.error('Text extraction failed', { file: path.basename(filePath), err: err.message });
    return { text: '', error: err.message };
  }
}
