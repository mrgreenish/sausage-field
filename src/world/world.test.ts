import { describe, expect, it } from 'vitest';
import { generateWorld, nearbyIds } from './generate';
import { terrainHeight } from './terrain';

describe('field generation', () => {
  it('is deterministic and creates varied morphology', () => {
    const a = generateWorld(1234, 400);
    const b = generateWorld(1234, 400);
    expect(a.sausages).toEqual(b.sausages);
    expect(new Set(a.sausages.map((spec) => spec.firmness)).size).toBe(400);
    expect(a.sausages.filter((spec) => spec.radius >= 0.12).length).toBeGreaterThan(40);
    expect(a.sausages.filter((spec) => spec.veinStrength >= 0.72).length).toBeGreaterThan(55);
  });

  it('indexes nearby plants without returning the entire field', () => {
    const world = generateWorld(10, 500);
    const ids = nearbyIds(world, 0, 0, 5);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThan(100);
  });

  it('samples stable terrain heights', () => {
    expect(terrainHeight(12.3, -8.7)).toBeCloseTo(terrainHeight(12.3, -8.7), 12);
    expect(Math.abs(terrainHeight(12.3, -8.7))).toBeLessThan(1.2);
  });
});
