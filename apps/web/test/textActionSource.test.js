import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const source = (relativePath) =>
  readFile(path.join(import.meta.dirname, '..', relativePath), 'utf8');

test('text actions reveal an underline without layout movement', async () => {
  const css = await source('src/index.css');

  assert.match(css, /\.text-action\s*\{[\s\S]*cursor:\s*pointer/);
  assert.match(css, /\.text-action\s*\{[\s\S]*background-size:\s*0 2px/);
  assert.match(css, /\.text-action:hover[\s\S]*background-size:\s*100% 2px/);
  assert.match(css, /\.text-action:focus-visible[\s\S]*background-size:\s*100% 2px/);
  assert.match(css, /\.text-action\[aria-current="page"\][\s\S]*background-size:\s*100% 2px/);
  assert.match(css, /\.text-action:disabled[\s\S]*cursor:\s*not-allowed[\s\S]*background-size:\s*0 2px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.text-action[\s\S]*transition:\s*none/);
});

test('storefront navigation and footer opt into text actions', async () => {
  const shell = await source('src/components/Shell.jsx');

  assert.match(shell, /className="text-action touch-target text-\[12px\][^"]*lg:hidden"/);
  assert.match(shell, /transition-colors text-action hover:text-accent/);
  assert.match(shell, /text-action hidden text-\[12px\]/);
  assert.match(shell, /className="text-action border-b border-line px-5 py-4/);
  assert.match(shell, /className="text-action hover:text-accent"/);
});

test('admin desktop and mobile navigation opt into text actions', async () => {
  const admin = await source('src/admin/AdminLayout.jsx');

  assert.match(admin, /`text-action rounded-\[var\(--radius-admin\)\]/);
  assert.match(admin, /`text-action block cursor-pointer/);
  assert.match(admin, /className={`text-action flex w-full items-center/);
  assert.match(admin, /`text-action whitespace-nowrap text-\[11px\]/);
  assert.match(admin, /className="text-action block text-xs uppercase/);
});
