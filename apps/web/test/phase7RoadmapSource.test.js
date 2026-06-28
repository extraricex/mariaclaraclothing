import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const roadmapPath = path.join(import.meta.dirname, '..', '..', '..', 'docs', 'enhancementdata2.md');

test('enhancement roadmap reflects completed phases and packed status wording', async () => {
  const source = await readFile(roadmapPath, 'utf8');

  assert.match(source, /Phase 1 through Phase 7A are finished/);
  assert.doesNotMatch(source, /Change status to Packing/);
  assert.match(source, /Change status to Packed/);
});
