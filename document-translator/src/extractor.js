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

async function extractPdf(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer, { normalizeWhitespace: true });
    const text = data.text?.trim() || '';

    logger.info('PDF extracted', { file: path.basename(filePath), chars: text.length, pages: data.numpages });

    if (text.length < 20) {
      logger.warn('PDF text very short — may be a scanned image', { file: path.basename(filePath) });
    }

    return { text, error: null };
  } catch (err) {
    logger.error('PDF extraction failed', { file: path.basename(filePath), err: err.message });
    return { text: '', error: err.message };
  }
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
