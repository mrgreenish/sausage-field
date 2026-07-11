import { hash2, smoothstep } from '../utils/rng';

function valueNoise(x: number, z: number, scale: number, seed: number): number {
  const sx = x / scale;
  const sz = z / scale;
  const x0 = Math.floor(sx);
  const z0 = Math.floor(sz);
  const tx = smoothstep(0, 1, sx - x0);
  const tz = smoothstep(0, 1, sz - z0);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  const ab = a + (b - a) * tx;
  const cd = c + (d - c) * tx;
  return ab + (cd - ab) * tz;
}

export function terrainHeight(x: number, z: number): number {
  const broad = valueNoise(x, z, 30, 71) - 0.5;
  const medium = valueNoise(x, z, 11, 193) - 0.5;
  const ripple = Math.sin(x * 0.047 + z * 0.031) * 0.08;
  return broad * 1.15 + medium * 0.34 + ripple;
}
