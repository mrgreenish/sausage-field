import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const sourceDir = path.join(root, 'assets/imagegen');
const outputDir = path.join(root, 'public/assets/textures');
const tileSize = 1024;

const sausageSources = [
  'sausage-pale.png',
  'sausage-rose.png',
  'sausage-fatty.png',
  'sausage-coarse.png',
];

async function requireSource(name: string): Promise<string> {
  const file = path.join(sourceDir, name);
  await access(file);
  return file;
}

function mix(a: number, b: number, t: number): number {
  return Math.round(a * (1 - t) + b * t);
}

function periodicEdges(data: Uint8Array, width: number, height: number, channels: number, band = 80): void {
  for (let d = 0; d < band; d += 1) {
    const t = (d / band) ** 2 * (3 - 2 * d / band);
    for (let y = 0; y < height; y += 1) {
      for (let c = 0; c < channels; c += 1) {
        const li = (y * width + d) * channels + c;
        const ri = (y * width + width - 1 - d) * channels + c;
        const average = (data[li] + data[ri]) * 0.5;
        data[li] = mix(average, data[li], t);
        data[ri] = mix(average, data[ri], t);
      }
    }
  }
  for (let d = 0; d < band; d += 1) {
    const t = (d / band) ** 2 * (3 - 2 * d / band);
    for (let x = 0; x < width; x += 1) {
      for (let c = 0; c < channels; c += 1) {
        const ti = (d * width + x) * channels + c;
        const bi = ((height - 1 - d) * width + x) * channels + c;
        const average = (data[ti] + data[bi]) * 0.5;
        data[ti] = mix(average, data[ti], t);
        data[bi] = mix(average, data[bi], t);
      }
    }
  }
}

async function repairedTile(file: string, size = tileSize): Promise<Buffer> {
  const { data, info } = await sharp(file)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  periodicEdges(pixels, info.width, info.height, info.channels);
  return sharp(pixels, { raw: info }).png().toBuffer();
}

async function buildAtlas(): Promise<Buffer> {
  const tiles = await Promise.all(sausageSources.map(async (name) => repairedTile(await requireSource(name))));
  return sharp({
    create: { width: tileSize * 2, height: tileSize * 2, channels: 3, background: '#a15f59' },
  }).composite(tiles.map((input, index) => ({
    input,
    left: index % 2 * tileSize,
    top: Math.floor(index / 2) * tileSize,
  }))).png().toBuffer();
}

async function deriveMaps(master: Buffer, prefix: string): Promise<void> {
  const { data, info } = await sharp(master).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const channels = info.channels;
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i += 1) {
    const base = i * channels;
    luma[i] = data[base] * 0.2126 + data[base + 1] * 0.7152 + data[base + 2] * 0.0722;
  }
  const normal = Buffer.alloc(width * height * 3);
  const orm = Buffer.alloc(width * height * 3);
  const coat = Buffer.alloc(width * height * 3);
  const sample = (x: number, y: number) => luma[((y + height) % height) * width + ((x + width) % width)];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const dx = (sample(x + 1, y) - sample(x - 1, y)) / 255;
      const dy = (sample(x, y + 1) - sample(x, y - 1)) / 255;
      const nx = -dx * 1.7;
      const ny = dy * 1.7;
      const nz = 1;
      const length = Math.hypot(nx, ny, nz);
      normal[index * 3] = Math.round((nx / length * 0.5 + 0.5) * 255);
      normal[index * 3 + 1] = Math.round((ny / length * 0.5 + 0.5) * 255);
      normal[index * 3 + 2] = Math.round((nz / length * 0.5 + 0.5) * 255);
      const micro = Math.min(1, Math.abs(dx) + Math.abs(dy));
      orm[index * 3] = Math.round(228 - micro * 38);
      orm[index * 3 + 1] = Math.round(105 + micro * 74);
      orm[index * 3 + 2] = 0;
      coat[index * 3] = Math.round(210 + micro * 35);
      coat[index * 3 + 1] = Math.round(22 + micro * 38);
      coat[index * 3 + 2] = Math.round(Math.max(0, 210 - luma[index]) * 0.72);
    }
  }
  await Promise.all([
    sharp(normal, { raw: { width, height, channels: 3 } }).webp({ quality: 92, effort: 5 }).toFile(path.join(outputDir, `${prefix}-normal.webp`)),
    sharp(orm, { raw: { width, height, channels: 3 } }).webp({ quality: 92, effort: 5 }).toFile(path.join(outputDir, `${prefix}-orm.webp`)),
    sharp(coat, { raw: { width, height, channels: 3 } }).webp({ quality: 92, effort: 5 }).toFile(path.join(outputDir, `${prefix}-coat.webp`)),
  ]);
}

async function main(): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const atlas = await buildAtlas();
  await sharp(atlas).webp({ quality: 90, effort: 6 }).toFile(path.join(outputDir, 'sausage-atlas.webp'));
  await deriveMaps(atlas, 'sausage');

  const turf = await repairedTile(await requireSource('ground-turf.png'), 2048);
  const macro = await repairedTile(await requireSource('ground-macro.png'), 1024);
  const macroOverlay = await sharp(macro).ensureAlpha(0.28).png().toBuffer();
  const ground = await sharp(turf).composite([{ input: macroOverlay, tile: true, blend: 'soft-light' }]).png().toBuffer();
  await sharp(ground).webp({ quality: 88, effort: 6 }).toFile(path.join(outputDir, 'ground-turf.webp'));
  await deriveMaps(ground, 'ground');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Texture build failed: ${message}\n`);
  process.exitCode = 1;
});
