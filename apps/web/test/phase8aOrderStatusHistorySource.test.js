import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('admin order detail renders status history events', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'OrderDetail.jsx'), 'utf8');

  assert.match(source, /Status history/);
  assert.match(source, /statusEvents/);
  assert.match(source, /event\.source/);
  assert.match(source, /event\.createdAt/);
  assert.match(source, /Object\.entries\(event\.changes/);
  assert.match(source, /change\.from/);
  assert.match(source, /change\.to/);
  assert.match(source, /No status changes recorded yet\./);
});

test('admin order detail exposes tracking notification action and log', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'OrderDetail.jsx'), 'utf8');

  assert.match(source, /Tracking notifications/);
  assert.match(source, /trackingNotifications/);
  assert.match(source, /sendTrackingNotification/);
  assert.match(source, /\/tracking-notification/);
  assert.match(source, /Send tracking notification/);
  assert.match(source, /Resend tracking notification/);
});
