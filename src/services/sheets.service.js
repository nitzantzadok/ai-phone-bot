/**
 * Google Sheets Service
 * Reads training plan spreadsheets and writes generated weekly plans back
 *
 * Auth: Google Service Account. Share the spreadsheet with the service
 * account email (Editor) before running.
 */

const fs = require('fs');
const { google } = require('googleapis');
const logger = require('../utils/logger');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Google allows 60 read requests per minute per user. A sheet with a tab
 * per trainee blows through that, so back off and retry rather than
 * dropping trainees from the run.
 */
async function withRetry(label, fn) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      const status = err.code || err.status || err.response?.status;
      if (!RETRY_STATUSES.has(Number(status)) || attempt === MAX_ATTEMPTS) throw err;

      const wait = Math.min(2 ** attempt * 1000, 32000);
      logger.warn('Sheets request throttled, backing off', { label, status, attempt, wait });
      lastError = err;
      await sleep(wait);
    }
  }

  throw lastError;
}

class SheetsService {
  constructor() {
    this.sheets = null;
    this.spreadsheetId = process.env.TRAINING_SHEET_ID || null;
    // Spacing between calls keeps a full run under the per-minute quota
    this.minIntervalMs = Number(process.env.TRAINING_SHEET_MIN_INTERVAL_MS || 1100);
    this.lastCallAt = 0;
  }

  /** Space out consecutive API calls */
  async throttle() {
    const wait = this.lastCallAt + this.minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastCallAt = Date.now();
  }

  /**
   * Build the credentials object from env.
   * Supports either an inline JSON blob or a path to a key file.
   */
  loadCredentials() {
    const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (inline) {
      try {
        return JSON.parse(inline);
      } catch (err) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
      }
    }

    const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (keyFile && fs.existsSync(keyFile)) {
      return JSON.parse(fs.readFileSync(keyFile, 'utf8'));
    }

    throw new Error(
      'No Google credentials found. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS'
    );
  }

  /**
   * Lazily authenticate and cache the Sheets client
   */
  async getClient() {
    if (this.sheets) return this.sheets;

    const credentials = this.loadCredentials();
    const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
    const authClient = await auth.getClient();

    this.sheets = google.sheets({ version: 'v4', auth: authClient });
    logger.debug('Google Sheets client initialized', {
      serviceAccount: credentials.client_email
    });

    return this.sheets;
  }

  resolveSpreadsheetId(spreadsheetId) {
    const id = spreadsheetId || this.spreadsheetId;
    if (!id) {
      throw new Error('No spreadsheet id. Set TRAINING_SHEET_ID or pass one explicitly');
    }
    return id;
  }

  /**
   * List all tabs in the spreadsheet
   * @returns {Array<{title: string, sheetId: number, index: number}>}
   */
  async listTabs(spreadsheetId) {
    const sheets = await this.getClient();
    const id = this.resolveSpreadsheetId(spreadsheetId);

    await this.throttle();
    const res = await withRetry(`listTabs`, () => sheets.spreadsheets.get({
      spreadsheetId: id,
      fields: 'sheets.properties(sheetId,title,index)'
    }));

    return (res.data.sheets || []).map((s) => ({
      title: s.properties.title,
      sheetId: s.properties.sheetId,
      index: s.properties.index
    }));
  }

  /**
   * Read a whole tab as a 2D array of strings.
   * Missing trailing cells are padded so every row has the same length.
   * @returns {Array<Array<string>>}
   */
  async readTab(tabTitle, spreadsheetId) {
    const sheets = await this.getClient();
    const id = this.resolveSpreadsheetId(spreadsheetId);

    await this.throttle();
    const res = await withRetry(`readTab:${tabTitle}`, () => sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `'${tabTitle.replace(/'/g, "''")}'`,
      valueRenderOption: 'FORMATTED_VALUE',
      majorDimension: 'ROWS'
    }));

    const rows = res.data.values || [];
    const width = rows.reduce((max, row) => Math.max(max, row.length), 0);

    return rows.map((row) => {
      const padded = new Array(width).fill('');
      row.forEach((cell, i) => {
        padded[i] = cell === null || cell === undefined ? '' : String(cell).trim();
      });
      return padded;
    });
  }

  /**
   * Create a new tab. If a tab with that title exists it is left alone and
   * the existing sheetId is returned.
   */
  async ensureTab(tabTitle, spreadsheetId) {
    const sheets = await this.getClient();
    const id = this.resolveSpreadsheetId(spreadsheetId);

    const existing = await this.listTabs(id);
    const match = existing.find((t) => t.title === tabTitle);
    if (match) {
      logger.debug('Tab already exists, reusing', { tabTitle });
      return match.sheetId;
    }

    await this.throttle();
    const res = await withRetry(`addSheet:${tabTitle}`, () => sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabTitle, rightToLeft: true } } }]
      }
    }));

    const sheetId = res.data.replies[0].addSheet.properties.sheetId;
    logger.info('Created tab', { tabTitle, sheetId });
    return sheetId;
  }

  /**
   * Write a 2D array into a tab, starting at A1.
   * Creates the tab if it does not exist. Existing values in the written
   * range are overwritten; nothing outside the range is touched.
   */
  async writeTab(tabTitle, values, spreadsheetId) {
    const sheets = await this.getClient();
    const id = this.resolveSpreadsheetId(spreadsheetId);

    await this.ensureTab(tabTitle, id);

    await this.throttle();
    await withRetry(`writeTab:${tabTitle}`, () => sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `'${tabTitle.replace(/'/g, "''")}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    }));

    logger.info('Wrote plan to tab', { tabTitle, rows: values.length });
    return { tabTitle, rows: values.length };
  }
}

module.exports = new SheetsService();
module.exports.SheetsService = SheetsService;
