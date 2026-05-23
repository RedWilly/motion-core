import { describe, expect, test } from 'bun:test';
import { normalizeAmplitude, normalizeBand } from './index';

describe('audio normalization helpers', () => {
  test('normalizes amplitude into the 0..1 range', () => {
    expect(normalizeAmplitude(new Float32Array([0, 0.5, -0.5, 1]))).toBeGreaterThan(0);
    expect(normalizeAmplitude(new Float32Array([2, 2]))).toBe(1);
  });

  test('normalizes frequency bands into the 0..1 range', () => {
    expect(normalizeBand(-1)).toBe(0);
    expect(normalizeBand(128, 255)).toBeGreaterThan(0.5);
    expect(normalizeBand(300, 255)).toBe(1);
  });
});
