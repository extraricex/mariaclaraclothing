import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const source = (file) => readFile(path.join(import.meta.dirname, '..', file), 'utf8');

test('shared theme uses the approved two-tone endpoints and keeps typography unchanged', async () => {
  const css = await source('src/index.css');

  assert.match(css, /--color-paper:\s*#f1f1f1;/i);
  assert.match(css, /--color-cream:\s*#f1f1f1;/i);
  assert.match(css, /--color-white:\s*#f1f1f1;/i);
  assert.match(css, /--color-ink:\s*#202020;/i);
  assert.match(css, /--color-accent:\s*#202020;/i);
  assert.match(css, /--color-accent-deep:\s*#202020;/i);
  assert.match(css, /--font-display:\s*"Clash Display", "Archivo Black", sans-serif;/);
  assert.match(css, /--font-body:\s*"Switzer", "Helvetica Neue", sans-serif;/);
  assert.doesNotMatch(css, /Cloister|Old English|Unifraktur/i);
});

test('derived neutral interface tokens use only the approved endpoints', async () => {
  const css = await source('src/index.css');
  const neutralTokens = {
    'ink-soft': 78,
    clay: 58,
    line: 22,
  };

  for (const [token, percentage] of Object.entries(neutralTokens)) {
    assert.match(
      css,
      new RegExp(
        `--color-${token}:\\s*color-mix\\(in srgb, #202020 ${percentage}%, #f1f1f1\\);`,
        'i',
      ),
    );
  }
});
