import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('all enabled buttons expose consistent interaction feedback', async () => {
  const css = await readFile(path.join(import.meta.dirname, '..', 'src', 'index.css'), 'utf8');

  assert.match(css, /button:not\(:disabled\):not\(\[aria-disabled="true"\]\)[\s\S]*cursor:\s*pointer/);
  assert.match(css, /\[role="button"\]:not\(\[aria-disabled="true"\]\)[\s\S]*cursor:\s*pointer/);
  for (const className of ['btn-ink', 'btn-ghost', 'btn-secondary']) {
    assert.match(css, new RegExp(`\\.${className}:not\\(\\[aria-disabled="true"\\]\\)`));
  }
  assert.match(css, /:focus-visible[\s\S]*outline:\s*2px solid currentColor/);
  assert.match(css, /button:disabled,[\s\S]*cursor:\s*not-allowed[\s\S]*transform:\s*none/);
  assert.match(css, /\.btn-ink:not\(\[aria-disabled="true"\]\),[\s\S]*box-shadow:\s*none/);
  assert.doesNotMatch(css, /box-shadow:\s*0\s+[24]px\s+0/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*transition:\s*none !important[\s\S]*transform:\s*none !important/);
  assert.match(css, /:is\(\s*a\[href\][\s\S]*summary[\s\S]*label:has/);
  assert.match(css, /input:is\([\s\S]*\[type="checkbox"\][\s\S]*\[type="radio"\][\s\S]*\):not\(:disabled\)/);
  assert.match(css, /select:not\(:disabled\)/);
  assert.match(css, /cursor:\s*pointer !important/);
  assert.match(css, /:is\(\s*button:disabled[\s\S]*input:is\([\s\S]*\):disabled[\s\S]*select:disabled/);
  assert.match(css, /cursor:\s*not-allowed !important/);
  assert.match(css, /\)\s*\*\s*\{[\s\S]*cursor:\s*inherit !important/);
});
