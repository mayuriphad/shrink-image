import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDimensions } from '../dist/index.js';

test('calculateDimensions - retains original size if already within bounds', () => {
  const result = calculateDimensions(800, 600, 1920);
  assert.deepEqual(result, { width: 800, height: 600 });
});

test('calculateDimensions - scales down landscape images preserving ratio', () => {
  // 4000x2000 scaled down to max 2000 -> 2000x1000
  const result = calculateDimensions(4000, 2000, 2000);
  assert.deepEqual(result, { width: 2000, height: 1000 });
});

test('calculateDimensions - scales down portrait images preserving ratio', () => {
  // 1500x3000 scaled down to max 1000 -> 500x1000
  const result = calculateDimensions(1500, 3000, 1000);
  assert.deepEqual(result, { width: 500, height: 1000 });
});

test('calculateDimensions - scales square images correctly', () => {
  const result = calculateDimensions(3000, 3000, 800);
  assert.deepEqual(result, { width: 800, height: 800 });
});
