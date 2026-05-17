import { DocumentWatcher } from './src/watcher.js';
import logger from './src/logger.js';

const watcher = new DocumentWatcher();

function shutdown() {
  logger.info('Shutting down...');
  watcher.stop();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

watcher.start();
