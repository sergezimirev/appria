import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import config from '../config/config.js';
import logger from './logger.js';

const execFileAsync = promisify(execFile);

function escapeAppleScript(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

export async function createNote(title, body) {
  const folder = config.notes.folder;
  const timestamp = new Date().toLocaleString('pl-PL');
  const fullBody = `${body}<br><br><i>Dodano: ${timestamp}</i>`;

  // Write body to a temp file to avoid AppleScript string length limits
  // and quoting issues with arbitrary HTML content
  const tmpFile = path.join(os.tmpdir(), `note-${Date.now()}.html`);
  fs.writeFileSync(tmpFile, fullBody, 'utf8');

  const script = `
    set noteBody to read POSIX file "${tmpFile}" as «class utf8»
    tell application "Notes"
      if not (exists folder "${escapeAppleScript(folder)}") then
        make new folder with properties {name:"${escapeAppleScript(folder)}"}
      end if
      set targetFolder to folder "${escapeAppleScript(folder)}"
      make new note at targetFolder with properties {name:"${escapeAppleScript(title)}", body:noteBody}
    end tell
  `;

  try {
    await execFileAsync('osascript', ['-e', script]);
    logger.info('Apple Note created', { title, folder });
    return { success: true };
  } catch (err) {
    logger.error('Apple Note creation failed', { title, err: err.message });
    return { success: false, error: err.message };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}
