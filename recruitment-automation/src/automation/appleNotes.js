import { runAppleScript, escapeAppleScript } from '../utils/helpers.js';
import config from '../../config/config.js';
import logger from '../logging/logger.js';

export async function createCandidateNote(candidate, { hrappkaUrl = null, recruiterEmail = null } = {}) {
  const folder = config.notes.folder;
  const title = `${candidate.lastName || 'Unknown'}, ${candidate.firstName || 'Unknown'} — ${candidate.jobPosition || 'No Position'}`;

  const lines = [
    `Kandydat: ${candidate.firstName || '—'} ${candidate.lastName || '—'}`,
    `Telefon: ${candidate.phone || '—'}`,
    `Email: ${candidate.email || '—'}`,
    `PESEL: ${candidate.pesel || '—'}`,
    `Obywatelstwo: ${candidate.citizenship || '—'}`,
    `Stanowisko: ${candidate.jobPosition || '—'}`,
    `Stawka: ${candidate.hourlyRate || '—'}`,
    `Data start: ${candidate.startDate || '—'}`,
    candidate.notes ? `Uwagi: ${candidate.notes}` : null,
    candidate.sourceAgency ? `Agencja: ${candidate.sourceAgency}` : null,
    hrappkaUrl ? `HRappka: ${hrappkaUrl}` : null,
    recruiterEmail ? `Rekruter (email): ${recruiterEmail}` : null,
    `Dodano: ${new Date().toLocaleString('pl-PL')}`,
  ].filter(Boolean);

  const body = lines.join('\n');

  const script = `
    tell application "Notes"
      activate
      if not (exists folder "${escapeAppleScript(folder)}") then
        make new folder with properties {name:"${escapeAppleScript(folder)}"}
      end if
      set targetFolder to folder "${escapeAppleScript(folder)}"
      make new note at targetFolder with properties {name:"${escapeAppleScript(title)}", body:"${escapeAppleScript(body)}"}
    end tell
  `;

  try {
    await runAppleScript(script);
    logger.info('Apple Note created', { title });
    return { success: true, title };
  } catch (err) {
    logger.error('Apple Note creation failed', { err: err.message, title });
    return { success: false, error: err.message };
  }
}
