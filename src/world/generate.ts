import { SAUSAGE_COUNT, WORLD_HALF } from '../config';
import type { SausageSpec } from '../types';
import { Rng } from '../utils/rng';
import { terrainHeight } from './terrain';

export interface GeneratedWorld {
  sausages: SausageSpec[];
  cells: Map<string, number[]>;
}

const CELL_SIZE = 6;

export function cellKey(x: number, z: number): string {
  return `${Math.floor((x + WORLD_HALF) / CELL_SIZE)},${Math.floor((z + WORLD_HALF) / CELL_SIZE)}`;
}

export function generateWorld(seed: number, count = SAUSAGE_COUNT): GeneratedWorld {
  const rng = new Rng(seed);
  const sausages: SausageSpec[] = [];
  const cells = new Map<string, number[]>();
  const occupancy = new Map<string, Array<[number, number, number]>>();
  let attempts = 0;

  while (sausages.length < count && attempts < count * 30) {
    attempts += 1;
    const x = rng.range(-WORLD_HALF + 2, WORLD_HALF - 2);
    const z = rng.range(-WORLD_HALF + 2, WORLD_HALF - 2);
    if (x * x + z * z < 10) continue;

    const girthy = rng.next() < 0.2;
    const radius = girthy ? rng.range(0.12, 0.19) : rng.range(0.055, 0.12);
    const minDistance = 0.68 + radius * 1.8;
    const cx = Math.floor((x + WORLD_HALF) / CELL_SIZE);
    const cz = Math.floor((z + WORLD_HALF) / CELL_SIZE);
    let clear = true;
    for (let dz = -1; dz <= 1 && clear; dz += 1) {
      for (let dx = -1; dx <= 1 && clear; dx += 1) {
        const bucket = occupancy.get(`${cx + dx},${cz + dz}`);
        if (!bucket) continue;
        clear = bucket.every(([px, pz, pd]) => Math.hypot(x - px, z - pz) > Math.max(minDistance, pd));
      }
    }
    if (!clear) continue;

    const firmness = rng.range(0.08, 0.98);
    const id = sausages.length;
    const spec: SausageSpec = {
      id, x, z, groundY: terrainHeight(x, z) - radius * 0.18,
      yaw: rng.range(0, Math.PI * 2), height: rng.range(0.72, girthy ? 1.7 : 1.9), radius,
      taper: rng.range(0.78, 1.04), bulge: rng.range(0.02, 0.18),
      leanX: rng.range(-0.11, 0.11), leanZ: rng.range(-0.11, 0.11),
      family: rng.int(0, 4), wetness: rng.range(0.54, 1),
      veinStrength: rng.next() < 0.25 ? rng.range(0.72, 1) : rng.range(0.04, 0.42),
      firmness, damping: 0.91 + firmness * 0.065, windPhase: rng.range(0, Math.PI * 2), seed: rng.next(),
    };
    sausages.push(spec);
    const key = `${cx},${cz}`;
    const occupied = occupancy.get(key) ?? [];
    occupied.push([x, z, minDistance]);
    occupancy.set(key, occupied);
    const ids = cells.get(key) ?? [];
    ids.push(id);
    cells.set(key, ids);
  }

  return { sausages, cells };
}

export function nearbyIds(world: GeneratedWorld, x: number, z: number, radius: number): number[] {
  const result: number[] = [];
  const minX = Math.floor((x - radius + WORLD_HALF) / CELL_SIZE);
  const maxX = Math.floor((x + radius + WORLD_HALF) / CELL_SIZE);
  const minZ = Math.floor((z - radius + WORLD_HALF) / CELL_SIZE);
  const maxZ = Math.floor((z + radius + WORLD_HALF) / CELL_SIZE);
  for (let cz = minZ; cz <= maxZ; cz += 1) {
    for (let cx = minX; cx <= maxX; cx += 1) {
      const ids = world.cells.get(`${cx},${cz}`);
      if (ids) result.push(...ids);
    }
  }
  return result;
}
