const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { hasDatabaseUrl, query } = require('../db/postgres');
const { resolveRuntimeDataFile } = require('../db/runtimeDataFile');

const DEFAULT_ISSUE_REPORTS_FILE = path.join(__dirname, '..', '..', 'data', 'issue-reports.json');
const VALID_ISSUE_TYPES = new Set([
  'checkout_problem',
  'product_information_issue',
  'payment_issue',
  'cart_issue',
  'website_display_ui_issue',
  'broken_link',
  'wrong_price',
  'wrong_stock',
  'other'
]);
const VALID_STATUSES = new Set(['new', 'reviewing', 'fixed', 'closed', 'invalid']);

function issueReportsDataFile() {
  return resolveRuntimeDataFile('ISSUE_REPORTS_DATA_FILE', DEFAULT_ISSUE_REPORTS_FILE);
}

function usePostgresReports() {
  return hasDatabaseUrl() && !process.env.ISSUE_REPORTS_DATA_FILE;
}

function publicError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeText(value, maxLength = 5000) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeIssueType(value) {
  const normalized = normalizeText(value, 80);
  if (!VALID_ISSUE_TYPES.has(normalized)) throw publicError('Issue type is required.');
  return normalized;
}

function normalizeStatus(value) {
  const normalized = normalizeText(value || 'new', 40);
  if (!VALID_STATUSES.has(normalized)) throw publicError('Issue status is invalid.');
  return normalized;
}

function normalizeReport(input = {}) {
  const issueType = normalizeIssueType(input.issueType);
  const message = normalizeText(input.message, 5000);
  if (!message) throw publicError('Message is required.');
  const now = new Date().toISOString();
  return {
    id: input.id || `issue-${Date.now()}-${crypto.randomUUID()}`,
    name: normalizeText(input.name, 120),
    email: normalizeText(input.email, 180),
    phone: normalizeText(input.phone, 80),
    issueType,
    message,
    pageUrl: normalizeText(input.pageUrl, 1000),
    deviceInfo: input.deviceInfo && typeof input.deviceInfo === 'object' ? input.deviceInfo : {},
    browserInfo: normalizeText(input.browserInfo, 240),
    screenSize: normalizeText(input.screenSize, 80),
    userAgent: normalizeText(input.userAgent, 600),
    customerId: normalizeText(input.customerId, 120),
    cartSnapshot: Array.isArray(input.cartSnapshot) ? input.cartSnapshot.slice(0, 40) : [],
    orderNumber: normalizeText(input.orderNumber, 80),
    errorMessage: normalizeText(input.errorMessage, 1000),
    screenshotUrl: normalizeText(input.screenshotUrl, 1000),
    status: normalizeStatus(input.status || 'new'),
    adminNote: normalizeText(input.adminNote, 5000),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now
  };
}

async function readStore() {
  try {
    const parsed = JSON.parse(await fs.readFile(issueReportsDataFile(), 'utf8'));
    return { reports: Array.isArray(parsed.reports) ? parsed.reports : [] };
  } catch (error) {
    if (error.code === 'ENOENT') return { reports: [] };
    throw error;
  }
}

async function writeStore(store) {
  const filePath = issueReportsDataFile();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ reports: store.reports || [] }, null, 2)}\n`);
}

async function createIssueReport(input) {
  const report = normalizeReport(input);
  if (usePostgresReports()) {
    await query(
      `INSERT INTO issue_reports (
        id, name, email, phone, issue_type, message, page_url, device_info,
        browser_info, screen_size, user_agent, customer_id, cart_snapshot,
        order_number, error_message, screenshot_url, status, admin_note, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb,
        $9, $10, $11, $12, $13::jsonb,
        $14, $15, $16, $17, $18, $19, $20
      )`,
      [
        report.id,
        report.name,
        report.email,
        report.phone,
        report.issueType,
        report.message,
        report.pageUrl,
        JSON.stringify(report.deviceInfo),
        report.browserInfo,
        report.screenSize,
        report.userAgent,
        report.customerId,
        JSON.stringify(report.cartSnapshot),
        report.orderNumber,
        report.errorMessage,
        report.screenshotUrl,
        report.status,
        report.adminNote,
        report.createdAt,
        report.updatedAt
      ]
    );
    return report;
  }

  const store = await readStore();
  store.reports.push(report);
  await writeStore(store);
  return report;
}

function reportMatches(report, filters = {}) {
  if (filters.status && report.status !== filters.status) return false;
  if (filters.issueType && report.issueType !== filters.issueType) return false;
  const search = normalizeText(filters.search, 160).toLowerCase();
  if (!search) return true;
  return [
    report.id,
    report.name,
    report.email,
    report.phone,
    report.message,
    report.orderNumber,
    report.pageUrl
  ].some((value) => String(value || '').toLowerCase().includes(search));
}

async function listIssueReports(filters = {}) {
  if (usePostgresReports()) {
    const values = [];
    const where = [];
    if (filters.status) {
      values.push(normalizeStatus(filters.status));
      where.push(`status = $${values.length}`);
    }
    if (filters.issueType) {
      values.push(normalizeIssueType(filters.issueType));
      where.push(`issue_type = $${values.length}`);
    }
    const search = normalizeText(filters.search, 160);
    if (search) {
      values.push(`%${search}%`);
      where.push(`(id ILIKE $${values.length} OR name ILIKE $${values.length} OR email ILIKE $${values.length} OR phone ILIKE $${values.length} OR message ILIKE $${values.length} OR order_number ILIKE $${values.length} OR page_url ILIKE $${values.length})`);
    }
    const result = await query(
      `SELECT * FROM issue_reports ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC, id DESC
       LIMIT 500`,
      values
    );
    return result.rows.map(fromPostgresReport);
  }
  const store = await readStore();
  return store.reports
    .filter((report) => reportMatches(report, filters))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 500);
}

async function findIssueReportById(id) {
  const normalizedId = normalizeText(id, 160);
  if (usePostgresReports()) {
    const result = await query('SELECT * FROM issue_reports WHERE id = $1', [normalizedId]);
    return result.rows[0] ? fromPostgresReport(result.rows[0]) : null;
  }
  const store = await readStore();
  return store.reports.find((report) => report.id === normalizedId) || null;
}

async function issueReportCounts() {
  const reports = await listIssueReports();
  return {
    total: reports.length,
    new: reports.filter((report) => report.status === 'new').length,
    open: reports.filter((report) => ['new', 'reviewing'].includes(report.status)).length
  };
}

async function updateIssueReport(id, changes = {}) {
  const normalizedId = normalizeText(id, 160);
  const status = changes.status === undefined ? undefined : normalizeStatus(changes.status);
  const adminNote = changes.adminNote === undefined ? undefined : normalizeText(changes.adminNote, 5000);
  const updatedAt = new Date().toISOString();

  if (usePostgresReports()) {
    const existing = await query('SELECT * FROM issue_reports WHERE id = $1', [normalizedId]);
    if (!existing.rows[0]) return null;
    const nextStatus = status === undefined ? existing.rows[0].status : status;
    const nextAdminNote = adminNote === undefined ? existing.rows[0].admin_note : adminNote;
    const result = await query(
      `UPDATE issue_reports
       SET status = $2, admin_note = $3, updated_at = $4
       WHERE id = $1
       RETURNING *`,
      [normalizedId, nextStatus, nextAdminNote, updatedAt]
    );
    return fromPostgresReport(result.rows[0]);
  }

  const store = await readStore();
  const index = store.reports.findIndex((report) => report.id === normalizedId);
  if (index < 0) return null;
  store.reports[index] = {
    ...store.reports[index],
    ...(status === undefined ? {} : { status }),
    ...(adminNote === undefined ? {} : { adminNote }),
    updatedAt
  };
  await writeStore(store);
  return store.reports[index];
}

async function deleteIssueReport(id) {
  const normalizedId = normalizeText(id, 160);
  const existing = await findIssueReportById(normalizedId);
  if (!existing) return false;
  if (usePostgresReports()) {
    const result = await query('DELETE FROM issue_reports WHERE id = $1 RETURNING id', [normalizedId]);
    if (!result.rows[0]) return false;
    await deleteIssueScreenshot(existing.screenshotUrl);
    return true;
  }
  const store = await readStore();
  const before = store.reports.length;
  store.reports = store.reports.filter((report) => report.id !== normalizedId);
  await writeStore(store);
  const deleted = store.reports.length !== before;
  if (deleted) await deleteIssueScreenshot(existing.screenshotUrl);
  return deleted;
}

async function deleteIssueScreenshot(screenshotUrl) {
  const filename = path.basename(String(screenshotUrl || ''));
  if (!filename) return;
  const uploadDir = process.env.ISSUE_UPLOAD_DIR || path.join(__dirname, '..', '..', 'private-uploads', 'issues');
  await fs.unlink(path.join(uploadDir, filename)).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

function fromPostgresReport(row) {
  return {
    id: row.id,
    name: row.name || '',
    email: row.email || '',
    phone: row.phone || '',
    issueType: row.issue_type || 'other',
    message: row.message || '',
    pageUrl: row.page_url || '',
    deviceInfo: row.device_info || {},
    browserInfo: row.browser_info || '',
    screenSize: row.screen_size || '',
    userAgent: row.user_agent || '',
    customerId: row.customer_id || '',
    cartSnapshot: row.cart_snapshot || [],
    orderNumber: row.order_number || '',
    errorMessage: row.error_message || '',
    screenshotUrl: row.screenshot_url || '',
    status: row.status || 'new',
    adminNote: row.admin_note || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : ''
  };
}

module.exports = {
  VALID_ISSUE_TYPES,
  VALID_STATUSES,
  createIssueReport,
  deleteIssueReport,
  findIssueReportById,
  issueReportCounts,
  listIssueReports,
  updateIssueReport
};
