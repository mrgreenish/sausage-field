import type { PersistedSettings, QualityName, QualityTier } from './types';

export const WORLD_SIZE = 180;
export const WORLD_HALF = WORLD_SIZE / 2;
export const WORLD_SEED = 834_771;
export const SAUSAGE_COUNT = 6_000;
export const PLAYER_HEIGHT = 1.68;
export const PLAYER_RADIUS = 0.34;
export const STORAGE_KEY = 'sausage-field.settings.v1';

export const QUALITY: Record<QualityName, QualityTier> = {
  low: {
    name: 'low', nearCount: 120, midCount: 420, farCount: 520,
    grassCount: 22_000, activeRods: 32, dpr: 1, shadowSize: 1024, shadowRadius: 14,
  },
  medium: {
    name: 'medium', nearCount: 260, midCount: 850, farCount: 850,
    grassCount: 58_000, activeRods: 64, dpr: 1.25, shadowSize: 2048, shadowRadius: 20,
  },
  high: {
    name: 'high', nearCount: 480, midCount: 1_350, farCount: 1_350,
    grassCount: 110_000, activeRods: 96, dpr: 1.5, shadowSize: 4096, shadowRadius: 26,
  },
};

export const DEFAULT_SETTINGS: PersistedSettings = {
  quality: 'auto', sound: true, sensitivity: 0.7, invertY: false, fov: 68, reducedMotion: false,
};
