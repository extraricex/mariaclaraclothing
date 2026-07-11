const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const { createIssueReport } = require('../issueReports/issueReportRepository');
const { getStoreSettings } = require('../settings/storeSettingsRepository');

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      const uploadDir = issueUploadDir();
      fs.mkdirSync(uploadDir, { recursive: true });
      callback(null, uploadDir);
    },
    filename: (_req, file, callback) => {
      const extension = imageExtension(file.mimetype);
      callback(null, `issue-${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!imageExtension(file.mimetype)) {
      const error = new Error('Screenshot must be an image.');
      error.status = 400;
      return callback(error);
    }
    return callback(null, true);
  }
});

router.post('/', upload.single('screenshot'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const report = await createIssueReport({
      ...body,
      deviceInfo: parseJson(body.deviceInfo, {}),
      cartSnapshot: parseJson(body.cartSnapshot, []),
      screenshotUrl: req.file ? req.file.filename : ''
    });
    notifyIssueReport(report).catch(() => {});
    return res.status(201).json({
      report: {
        id: report.id,
        issueType: report.issueType,
        status: report.status,
        createdAt: report.createdAt
      }
    });
  } catch (error) {
    if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
    return next(error);
  }
});

function parseJson(value, fallback) {
  if (value && typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (_error) {
    return fallback;
  }
}

async function notifyIssueReport(report) {
  const settings = await getStoreSettings();
  const webhookUrl = settings.website?.reportIssue?.webhookUrl;
  if (!webhookUrl) return;
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `New website issue reported: ${report.issueType}`,
      report: {
        id: report.id,
        issueType: report.issueType,
        message: report.message,
        pageUrl: report.pageUrl,
        orderNumber: report.orderNumber,
        createdAt: report.createdAt
      }
    })
  });
}

function issueUploadDir() {
  return process.env.ISSUE_UPLOAD_DIR || path.join(__dirname, '..', '..', 'private-uploads', 'issues');
}

function imageExtension(mimetype) {
  return ({
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif'
  })[String(mimetype || '').toLowerCase()] || '';
}

module.exports = { issueReportsRouter: router };
