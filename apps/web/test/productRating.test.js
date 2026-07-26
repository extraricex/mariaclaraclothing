import test from 'node:test';
import assert from 'node:assert/strict';
import { formatReviewCount, getStarFill } from '../src/lib/productRating.js';

test('fractional star fill follows the exact rating', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((index) => getStarFill(5, index)), [100, 100, 100, 100, 100]);
  assert.deepEqual([0, 1, 2, 3, 4].map((index) => getStarFill(4.7, index)), [100, 100, 100, 100, 70]);
  assert.deepEqual([0, 1, 2, 3, 4].map((index) => getStarFill(4.5, index)), [100, 100, 100, 100, 50]);
  assert.deepEqual([0, 1, 2, 3, 4].map((index) => getStarFill(3.2, index)), [100, 100, 100, 20, 0]);
  assert.deepEqual([0, 1, 2, 3, 4].map((index) => getStarFill(1, index)), [100, 0, 0, 0, 0]);
  assert.deepEqual([0, 1, 2, 3, 4].map((index) => getStarFill(0, index)), [0, 0, 0, 0, 0]);
});

test('review-count labels use correct grammar', () => {
  assert.equal(formatReviewCount(1), '1 review');
  assert.equal(formatReviewCount(18), '18 reviews');
  assert.equal(formatReviewCount(1204), '1,204 reviews');
});

test('invalid ratings clamp safely without inventing a positive fill', () => {
  assert.equal(getStarFill(-1, 0), 0);
  assert.equal(getStarFill(6, 4), 100);
  assert.equal(getStarFill(null, 0), 0);
  assert.equal(getStarFill(undefined, 0), 0);
  assert.equal(getStarFill(Number.NaN, 0), 0);
});
