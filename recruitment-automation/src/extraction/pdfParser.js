import fs from 'fs';
import pdfParse from 'pdf-parse';
import logger from '../logging/logger.js';

/**
 * Extracts raw text from a PDF file.
 * Returns { text, pageCount, metadata, error? }
 */
export async function parsePdf(pdfPath) {
  const buffer = fs.readFileSync(pdfPath);

  try {
    const data = await pdfParse(buffer, {
      // Normalize whitespace for better AI extraction
      normalizeWhitespace: true,
    });

    const text = data.text?.trim() || '';
    logger.info('PDF parsed', { path: pdfPath, pageCount: data.numpages, chars: text.length });

    if (text.length < 50) {
      logger.warn('PDF text very short — may be scanned image', { path: pdfPath, chars: text.length });
    }

    return {
      text,
      pageCount: data.numpages,
      metadata: data.metadata,
      isLikelyScanned: text.length < 50,
    };
  } catch (err) {
    logger.error('PDF parse failed', { path: pdfPath, err: err.message });
    return { text: '', pageCount: 0, metadata: null, isLikelyScanned: false, error: err.message };
  }
}
