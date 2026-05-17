import Anthropic from '@anthropic-ai/sdk';
import config from '../config/config.js';
import logger from './logger.js';

const client = new Anthropic({ apiKey: config.ai.apiKey });

export async function processDocument(text) {
  if (!text || text.trim().length < 5) {
    return { result: '', error: 'Text too short to process' };
  }

  try {
    const message = await client.messages.create({
      model: config.ai.model,
      max_tokens: config.ai.maxTokens,
      messages: [
        {
          role: 'user',
          content: `${config.ai.prompt}\n\n=== DOCUMENT ===\n${text}\n=== END OF DOCUMENT ===`,
        },
      ],
    });

    const result = message.content[0]?.text?.trim() || '';
    logger.info('Document processed', { inputChars: text.length, outputChars: result.length, model: config.ai.model });
    return { result, error: null };
  } catch (err) {
    logger.error('Document processing failed', { err: err.message });
    return { result: '', error: err.message };
  }
}
