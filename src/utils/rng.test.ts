import { describe, expect, it } from 'vitest';
import { Rng, hash2 } from './rng';

describe('deterministic randomness', () => {
  it('replays identical seeded sequences', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(Array.from({ length: 20 }, () => b.next()));
  });

  it('keeps hash noise normalized and stable', () => {
    expect(hash2(4, -9, 11)).toBe(hash2(4, -9, 11));
    expect(hash2(4, -9, 11)).toBeGreaterThanOrEqual(0);
    expect(hash2(4, -9, 11)).toBeLessThan(1);
  });
});
