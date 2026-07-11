import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  NoColorSpace,
} from 'three';
import { Rng } from '../utils/rng';

function canvasTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

export function createProceduralSausageAtlas(): CanvasTexture {
  const size = 1024;
  const tile = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Unable to create texture canvas');
  const palettes: Array<[number, number, number]> = [
    [191, 109, 98], [165, 69, 65], [206, 119, 104], [126, 47, 47],
  ];
  for (let family = 0; family < 4; family += 1) {
    const rng = new Rng(9_101 + family * 401);
    const ox = (family % 2) * tile;
    const oy = Math.floor(family / 2) * tile;
    const image = context.createImageData(tile, tile);
    const [br, bg, bb] = palettes[family];
    for (let y = 0; y < tile; y += 1) {
      for (let x = 0; x < tile; x += 1) {
        const index = (y * tile + x) * 4;
        const grain = Math.sin(x * 0.19 + Math.sin(y * 0.031) * 5) * 4 + (rng.next() - 0.5) * 13;
        const broad = Math.sin(x * 0.022 + y * 0.017) * 7 + Math.cos(y * 0.039) * 4;
        image.data[index] = Math.max(0, Math.min(255, br + grain + broad));
        image.data[index + 1] = Math.max(0, Math.min(255, bg + grain * 0.5 + broad));
        image.data[index + 2] = Math.max(0, Math.min(255, bb + grain * 0.42 + broad * 0.65));
        image.data[index + 3] = 255;
      }
    }
    context.putImageData(image, ox, oy);
    context.save();
    context.translate(ox, oy);
    const fatCount = family === 2 ? 110 : family === 3 ? 65 : 38;
    for (let i = 0; i < fatCount; i += 1) {
      context.fillStyle = `rgba(244, 215, 180, ${rng.range(0.08, 0.32)})`;
      context.beginPath();
      context.ellipse(rng.range(0, tile), rng.range(0, tile), rng.range(2, 14), rng.range(1, 7), rng.range(0, Math.PI), 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = 'rgba(87, 12, 24, 0.2)';
    context.lineWidth = 2.2;
    for (let vessel = 0; vessel < 6; vessel += 1) {
      context.beginPath();
      for (let y = -16; y <= tile + 16; y += 12) {
        const x = tile * (vessel + 0.5) / 6 + Math.sin(y * 0.035 + vessel) * 13;
        if (y === -16) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
    context.restore();
  }
  return canvasTexture(canvas);
}

export function createProceduralGroundTexture(): CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Unable to create texture canvas');
  const rng = new Rng(7_733);
  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const n = rng.next() * 28;
      const macro = Math.sin(x * 0.019) * 7 + Math.cos(y * 0.014) * 8 + Math.sin((x + y) * 0.006) * 6;
      image.data[index] = 49 + n * 0.34 + macro * 0.4;
      image.data[index + 1] = 72 + n + macro;
      image.data[index + 2] = 34 + n * 0.25 + macro * 0.36;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  context.globalAlpha = 0.35;
  for (let i = 0; i < 24_000; i += 1) {
    context.strokeStyle = rng.next() > 0.28 ? '#698447' : '#283d25';
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + rng.range(-2, 2), y - rng.range(2, 10));
    context.stroke();
  }
  const texture = canvasTexture(canvas);
  texture.repeat.set(22, 22);
  return texture;
}

export async function loadTextureOrFallback(path: string, fallback: () => Texture): Promise<Texture> {
  const loader = new TextureLoader();
  try {
    const texture = await loader.loadAsync(path);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.anisotropy = 8;
    return texture;
  } catch {
    return fallback();
  }
}

export async function loadOptionalDataTexture(path: string): Promise<Texture | undefined> {
  const loader = new TextureLoader();
  try {
    const texture = await loader.loadAsync(path);
    texture.colorSpace = NoColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.anisotropy = 8;
    return texture;
  } catch {
    return undefined;
  }
}
