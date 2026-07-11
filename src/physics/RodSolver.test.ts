import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { SausageSpec } from '../types';
import { RodSolver } from './RodSolver';

function spec(id: number, firmness: number): SausageSpec {
  return {
    id, x: 0, z: 0, groundY: 0, yaw: 0, height: 1.4, radius: 0.1,
    taper: 0.9, bulge: 0.05, leanX: 0, leanZ: 0, family: 0, wetness: 0.8,
    veinStrength: 0.8, firmness, damping: 0.94 + firmness * 0.03, windPhase: 0, seed: 0.5,
  };
}

describe('rod solver', () => {
  it('makes softer specimens bend more than firm specimens', () => {
    const solver = new RodSolver(4);
    const soft = spec(1, 0.1);
    const firm = spec(2, 0.95);
    const contact = {
      source: 'probe' as const,
      position: new Vector3(0, 0.8, 0),
      direction: new Vector3(1, 0, 0),
      radius: 0.08,
      pressure: 0.16,
      normalizedHeight: 0.6,
    };
    solver.applyContact(soft, contact);
    solver.applyContact(firm, contact);
    for (let i = 0; i < 8; i += 1) solver.step(1 / 60, i / 60);
    expect(solver.getVisualFor(soft.id)!.bend.length()).toBeGreaterThan(solver.getVisualFor(firm.id)!.bend.length());
  });

  it('keeps the root pinned and segment lengths finite after a strong contact', () => {
    const solver = new RodSolver(2);
    const plant = spec(1, 0.45);
    solver.applyContact(plant, {
      source: 'player', position: new Vector3(), direction: new Vector3(1, 0, 0),
      radius: 0.34, pressure: 0.7, normalizedHeight: 0.75,
    });
    for (let i = 0; i < 180; i += 1) solver.step(1 / 60, i / 60);
    const state = solver.active.get(plant.id);
    if (state) {
      expect(state.positions[0]).toEqual(state.rest[0]);
      for (const position of state.positions) {
        expect(Number.isFinite(position.x + position.y + position.z)).toBe(true);
      }
    }
  });

  it('keeps the most recently active rods when the active limit is reduced', () => {
    const solver = new RodSolver(3);
    const quiet = solver.wake(spec(1, 0.3));
    const active = solver.wake(spec(2, 0.3));
    const mostActive = solver.wake(spec(3, 0.3));
    quiet.lastImpulse = 0.02;
    active.lastImpulse = 0.18;
    mostActive.lastImpulse = 0.42;

    solver.setLimit(2);

    expect(solver.active.has(quiet.spec.id)).toBe(false);
    expect(solver.active.has(active.spec.id)).toBe(true);
    expect(solver.active.has(mostActive.spec.id)).toBe(true);
  });
});
