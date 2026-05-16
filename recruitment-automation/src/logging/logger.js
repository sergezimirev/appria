import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

const LOG_DIR = process.env.LOG_DIR
  ? path.resolve(process.env.LOG_DIR)
  : path.resolve('./logs');

fs.mkdirSync(LOG_DIR, { recursive: true });

const { combine, timestamp, printf, colorize, errors } = winston.format;

const structured = printf(({ level, message, timestamp, stack, ...meta }) => {
  const base = JSON.stringify({ ts: timestamp, level, message, ...meta });
  return stack ? `${base}\n${stack}` : base;
});

const prettyConsole = printf(({ level, message, timestamp, ...meta }) => {
  const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  return `[${timestamp}] ${level}: ${message}${extra}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(errors({ stack: true }), timestamp()),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), prettyConsole),
    }),
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      format: combine(timestamp(), structured),
    }),
    new DailyRotateFile({
      level: 'error',
      dirname: LOG_DIR,
      filename: 'errors-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      format: combine(timestamp(), structured),
    }),
  ],
});

export default logger;
