import type { Vector3 } from 'three';

export type QualityName = 'low' | 'medium' | 'high';

export interface QualityTier {
  name: QualityName;
  nearCount: number;
  midCount: number;
  farCount: number;
  grassCount: number;
  activeRods: number;
  dpr: number;
  shadowSize: number;
  shadowRadius: number;
}

export interface SausageSpec {
  id: number;
  x: number;
  z: number;
  groundY: number;
  yaw: number;
  height: number;
  radius: number;
  taper: number;
  bulge: number;
  leanX: number;
  leanZ: number;
  family: number;
  wetness: number;
  veinStrength: number;
  firmness: number;
  damping: number;
  windPhase: number;
  seed: number;
}

export interface ContactSample {
  source: 'player' | 'probe';
  position: Vector3;
  direction: Vector3;
  radius: number;
  pressure: number;
  normalizedHeight: number;
}

export interface PersistedSettings {
  quality: QualityName | 'auto';
  sound: boolean;
  sensitivity: number;
  invertY: boolean;
  fov: number;
  reducedMotion: boolean;
}

export interface VisibleBinding {
  lod: 'near' | 'mid' | 'far';
  index: number;
}
