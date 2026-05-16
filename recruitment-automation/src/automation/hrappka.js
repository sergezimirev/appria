import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import config from '../../config/config.js';
import logger from '../logging/logger.js';
import { withRetry, sleep } from '../utils/helpers.js';

const SCREENSHOT_DIR = config.paths.screenshots;
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function screenshot(page, label) {
  const file = path.join(SCREENSHOT_DIR, `${Date.now()}_${label}.png`);
  await page.screenshot({ path: file, fullPage: true });
  logger.info('Screenshot saved', { file });
}

export class HRappkaBot {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.loggedIn = false;
  }

  async init() {
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1440, height: 900 },
      // Persist session to avoid login on every run
      storageState: this._sessionPath(),
    });
    this.page = await this.context.newPage();
    logger.info('HRappka browser initialized');
  }

  _sessionPath() {
    const p = path.resolve('./data/hrappka-session.json');
    return fs.existsSync(p) ? p : undefined;
  }

  async _saveSession() {
    const p = path.resolve('./data/hrappka-session.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    await this.context.storageState({ path: p });
  }

  async ensureLoggedIn() {
    if (this.loggedIn) return;

    const { url, email, password } = config.hrappka;
    await this.page.goto(`${url}/login`, { waitUntil: 'networkidle' });

    // Check if already authenticated
    if (!this.page.url().includes('/login')) {
      logger.info('HRappka: session still valid');
      this.loggedIn = true;
      return;
    }

    logger.info('HRappka: logging in');
    await this.page.fill('[name="email"], input[type="email"]', email);
    await this.page.fill('[name="password"], input[type="password"]', password);
    await this.page.click('button[type="submit"], input[type="submit"]');

    await this.page.waitForURL((u) => !u.includes('/login'), { timeout: 15_000 });
    this.loggedIn = true;
    await this._saveSession();
    logger.info('HRappka: logged in');
  }

  async createCandidate(candidate, pdfPath) {
    return withRetry(
      async (attempt) => {
        logger.info('HRappka: creating candidate', {
          name: `${candidate.firstName} ${candidate.lastName}`,
          attempt,
        });
        return await this._doCreateCandidate(candidate, pdfPath);
      },
      {
        retries: config.retry.maxRetries,
        delayMs: config.retry.delayMs,
        label: 'hrappka-create-candidate',
      }
    );
  }

  async _doCreateCandidate(candidate, pdfPath) {
    const { url } = config.hrappka;
    await this.ensureLoggedIn();

    // Navigate to new candidate form
    await this.page.goto(`${url}/candidates/new`, { waitUntil: 'networkidle' });
    await screenshot(this.page, 'candidate_form_open');

    // Fill candidate fields using stable role/label selectors
    await this._fillField('Imię', candidate.firstName);
    await this._fillField('Nazwisko', candidate.lastName);
    await this._fillField('Telefon', candidate.phone || '');
    await this._fillField('Email', candidate.email || '');
    await this._fillField('PESEL', candidate.pesel || '');
    await this._fillField('Obywatelstwo', candidate.citizenship || '');
    await this._fillField('Stanowisko', candidate.jobPosition || '');
    await this._fillField('Stawka godzinowa', candidate.hourlyRate || '');

    if (candidate.startDate) {
      await this._fillField('Data rozpoczęcia', candidate.startDate);
    }

    if (candidate.notes) {
      const notesSelector = 'textarea[name*="note"], textarea[name*="uwag"], [aria-label*="uwag" i]';
      const notesEl = this.page.locator(notesSelector).first();
      if (await notesEl.count()) await notesEl.fill(candidate.notes);
    }

    // Upload PDF
    if (pdfPath && fs.existsSync(pdfPath)) {
      const fileInput = this.page.locator('input[type="file"]').first();
      if (await fileInput.count()) {
        await fileInput.setInputFiles(pdfPath);
        logger.info('HRappka: PDF uploaded');
      }
    }

    await screenshot(this.page, 'candidate_form_filled');

    // Save
    const saveButton = this.page.locator(
      'button[type="submit"], button:has-text("Zapisz"), button:has-text("Dodaj kandydata")'
    ).first();
    await saveButton.click();

    // Wait for confirmation
    await this.page.waitForURL((u) => u.includes('/candidate') && !u.includes('/new'), {
      timeout: 20_000,
    });

    const candidateId = this.page.url().match(/candidates?\/(\d+)/)?.[1];
    await screenshot(this.page, 'candidate_created');
    logger.info('HRappka: candidate created', { candidateId, url: this.page.url() });

    return { success: true, hrappkaId: candidateId, url: this.page.url() };
  }

  async _fillField(label, value) {
    if (!value) return;
    // Try multiple selector strategies for resilience
    const selectors = [
      `[aria-label="${label}"]`,
      `[placeholder="${label}"]`,
      `[name*="${label.toLowerCase().replace(/\s+/g, '_')}"]`,
      `label:has-text("${label}") + input`,
      `label:has-text("${label}") ~ input`,
      `label:has-text("${label}") input`,
    ];

    for (const sel of selectors) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.count() > 0) {
          await el.click();
          await el.fill(String(value));
          return;
        }
      } catch { /* try next selector */ }
    }
    logger.warn('HRappka: could not find field', { label });
  }

  async close() {
    await this._saveSession();
    await this.browser?.close();
  }
}

// Standalone test
if (process.argv.includes('--test')) {
  const bot = new HRappkaBot();
  await bot.init();
  try {
    await bot.ensureLoggedIn();
    console.log('TEST: Login successful');
  } finally {
    await bot.close();
  }
}
