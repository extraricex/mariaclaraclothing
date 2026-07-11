import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const source = (file) => readFile(path.join(import.meta.dirname, '..', 'src', file), 'utf8');

test('customer login exposes only configured real Google and Facebook OAuth routes', async () => {
  const login = await source('pages/CustomerAuth.jsx');
  assert.match(login, /\/api\/customer\/oauth\/status/);
  assert.match(login, /Continue with Google/);
  assert.match(login, /Continue with Facebook/);
  assert.match(login, /\/api\/customer\/oauth\/\$\{provider\}\/start/);
  assert.doesNotMatch(login, /localStorage.*google|localStorage.*facebook/i);
});

test('admin settings include social-login provider controls', async () => {
  const settings = await source('admin/Settings.jsx');
  assert.match(settings, /Enable Google login/);
  assert.match(settings, /Enable Facebook login/);
  assert.match(settings, /\/api\/admin\/settings\/authentication/);
});
