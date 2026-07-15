import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('customer shell renders report issue widget with debug capture', async () => {
  const [shell, widget, settings] = await Promise.all([
    readFile(path.join(import.meta.dirname, '..', 'src', 'components', 'Shell.jsx'), 'utf8'),
    readFile(path.join(import.meta.dirname, '..', 'src', 'components', 'ReportIssueWidget.jsx'), 'utf8'),
    readFile(path.join(import.meta.dirname, '..', 'src', 'lib', 'storeSettings.js'), 'utf8')
  ]);

  assert.match(shell, /ReportIssueWidget/);
  assert.match(widget, /Report Issue/);
  assert.match(widget, /\/api\/issue-reports/);
  assert.match(widget, /window\.addEventListener\('error'/);
  assert.match(widget, /cartSnapshot/);
  assert.match(widget, /screenshot/);
  assert.match(widget, /useModalFocus/);
  assert.match(widget, /inline = false/);
  assert.match(shell, /ReportIssueWidget settings=\{storeInfo\} cartItems=\{items\} inline/);
  assert.match(settings, /reportIssue/);
});

test('admin issue reports page and navigation badge are wired', async () => {
  const [app, layout, page, settings] = await Promise.all([
    readFile(path.join(import.meta.dirname, '..', 'src', 'App.jsx'), 'utf8'),
    readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'AdminLayout.jsx'), 'utf8'),
    readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'IssueReports.jsx'), 'utf8'),
    readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'Settings.jsx'), 'utf8')
  ]);

  assert.match(app, /issue-reports/);
  assert.match(layout, /Issue Reports/);
  assert.match(layout, /\/api\/admin\/issue-reports\/counts/);
  assert.match(page, /\/api\/admin\/issue-reports/);
  assert.match(page, /Admin note/);
  assert.match(settings, /ReportIssueCard/);
});
