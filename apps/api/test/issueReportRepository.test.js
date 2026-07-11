const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

function freshRepository() {
  delete require.cache[require.resolve('../src/issueReports/issueReportRepository')];
  return require('../src/issueReports/issueReportRepository');
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('issue reports persist, filter, count, update, and delete through JSON fallback', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-issues-'));
  const previousFile = process.env.ISSUE_REPORTS_DATA_FILE;
  const previousUploadDir = process.env.ISSUE_UPLOAD_DIR;
  process.env.ISSUE_REPORTS_DATA_FILE = path.join(tempDir, 'issue-reports.json');
  process.env.ISSUE_UPLOAD_DIR = path.join(tempDir, 'private-uploads');

  try {
    const repository = freshRepository();
    const report = await repository.createIssueReport({
      issueType: 'checkout_problem',
      message: 'Checkout did not continue.',
      name: 'Ariana',
      pageUrl: 'https://shop.example/checkout',
      cartSnapshot: [{ variantId: 'v1', quantity: 1 }],
      screenshotUrl: 'private-screenshot.png'
    });
    await fs.mkdir(process.env.ISSUE_UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(process.env.ISSUE_UPLOAD_DIR, 'private-screenshot.png'), 'image-data');

    assert.match(report.id, /^issue-/);
    assert.equal(report.status, 'new');
    assert.equal((await repository.issueReportCounts()).new, 1);
    assert.equal((await repository.listIssueReports({ search: 'checkout' })).length, 1);
    assert.equal((await repository.listIssueReports({ issueType: 'wrong_stock' })).length, 0);

    const updated = await repository.updateIssueReport(report.id, {
      status: 'reviewing',
      adminNote: 'Checking checkout logs.'
    });
    assert.equal(updated.status, 'reviewing');
    assert.equal(updated.adminNote, 'Checking checkout logs.');
    assert.equal((await repository.issueReportCounts()).open, 1);

    assert.equal(await repository.deleteIssueReport(report.id), true);
    assert.equal((await repository.issueReportCounts()).total, 0);
    await assert.rejects(fs.access(path.join(process.env.ISSUE_UPLOAD_DIR, 'private-screenshot.png')), /ENOENT/);
  } finally {
    restoreEnv('ISSUE_REPORTS_DATA_FILE', previousFile);
    restoreEnv('ISSUE_UPLOAD_DIR', previousUploadDir);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('issue reports require valid type and message', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-issues-invalid-'));
  const previousFile = process.env.ISSUE_REPORTS_DATA_FILE;
  process.env.ISSUE_REPORTS_DATA_FILE = path.join(tempDir, 'issue-reports.json');

  try {
    const repository = freshRepository();
    await assert.rejects(
      repository.createIssueReport({ issueType: 'bad', message: 'x' }),
      /Issue type is required/
    );
    await assert.rejects(
      repository.createIssueReport({ issueType: 'other', message: '' }),
      /Message is required/
    );
  } finally {
    restoreEnv('ISSUE_REPORTS_DATA_FILE', previousFile);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
