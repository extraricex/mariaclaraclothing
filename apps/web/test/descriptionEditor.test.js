import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESCRIPTION_COLORS,
  DESCRIPTION_FONT_SIZES,
  DESCRIPTION_FONT_STYLES,
  DESCRIPTION_FONT_WEIGHTS,
  applyDescriptionFormat,
  richStyleForCommand
} from '../src/admin/descriptionEditor.js';

test('description editor wraps selected text with inline formatting', () => {
  const result = applyDescriptionFormat('bold', 'Premium cotton shirt', 0, 7);

  assert.equal(result.value, '**Premium** cotton shirt');
  assert.deepEqual(result.selection, { start: 2, end: 9 });
});

test('description editor inserts list and link formatting', () => {
  const list = applyDescriptionFormat('bullet', 'Premium cotton', 0, 15);
  const link = applyDescriptionFormat('link', 'Size chart', 0, 10);

  assert.equal(list.value, '- Premium cotton');
  assert.equal(link.value, '[Size chart](https://)');
});

test('description editor applies heading formatting to the current line', () => {
  const result = applyDescriptionFormat('heading', 'Intro\nShipping details', 6, 14);

  assert.equal(result.value, 'Intro\n## Shipping details');
  assert.deepEqual(result.selection, { start: 9, end: 25 });
});

test('description editor exposes functional font style, size, color, and weight controls', () => {
  assert.ok(DESCRIPTION_FONT_STYLES.some((option) => option.command === 'italic'));
  assert.ok(DESCRIPTION_FONT_SIZES.some((option) => option.value === '20px'));
  assert.ok(DESCRIPTION_COLORS.some((option) => option.value === '#e8590c'));
  assert.ok(DESCRIPTION_FONT_WEIGHTS.some((option) => option.value === '700'));

  assert.deepEqual(richStyleForCommand('font-size', '20px'), { fontSize: '20px' });
  assert.deepEqual(richStyleForCommand('font-color', '#e8590c'), { color: '#e8590c' });
  assert.deepEqual(richStyleForCommand('font-weight', '700'), { fontWeight: '700' });
  assert.deepEqual(richStyleForCommand('italic'), { fontStyle: 'italic' });
});
