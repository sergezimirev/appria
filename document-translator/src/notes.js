import { execFile } from 'child_process';
import { promisify } from 'util';
import config from '../config/config.js';
import logger from './logger.js';

const execFileAsync = promisify(execFile);

function escapeAppleScript(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

export async function createNote(title, body) {
  const folder = config.notes.folder;
  const timestamp = new Date().toLocaleString('pl-PL');
  const fullBody = `${body}\n\nDodano: ${timestamp}`;

  const script = `
    tell application "Notes"
      activate
      if not (exists folder "${escapeAppleScript(folder)}") then
        make new folder with properties {name:"${escapeAppleScript(folder)}"}
      end if
      set targetFolder to folder "${escapeAppleScript(folder)}"
      make new note at targetFolder with properties {name:"${escapeAppleScript(title)}", body:"${escapeAppleScript(fullBody)}"}
    end tell
  `;

  try {
    await execFileAsync('osascript', ['-e', script]);
    logger.info('Apple Note created', { title, folder });
    return { success: true };
  } catch (err) {
    logger.error('Apple Note creation failed', { title, err: err.message });
    return { success: false, error: err.message };
  }
}
