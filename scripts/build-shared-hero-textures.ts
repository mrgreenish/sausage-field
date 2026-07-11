import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const source = path.join(root, 'assets/imagegen/sausage-fatty.png');
const output = path.join(root, 'shared-assets/textures');
const size = 2048;

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

async function main(): Promise<void> {
  await mkdir(output, { recursive: true });
  const master = await sharp(source)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .removeAlpha()
    .linear([0.98, 0.98, 0.98], [-2, -3, -2])
    .png()
    .toBuffer();
  await sharp(master).png({ compressionLevel: 8 }).toFile(path.join(output, 'hero-basecolor.png'));

  const { data, info } = await sharp(master).raw().toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;
  const luminance = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * 3;
    luminance[i] = data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
  }
  const sample = (x: number, y: number): number => luminance[((y + size) % size) * size + ((x + size) % size)];
  const normal = Buffer.alloc(pixelCount * 3);
  const orm = Buffer.alloc(pixelCount * 3);
  const coat = Buffer.alloc(pixelCount);
  const thickness = Buffer.alloc(pixelCount);
  const veins = Buffer.alloc(pixelCount);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const offset = index * 3;
      const dx = (sample(x + 1, y) - sample(x - 1, y)) / 255;
      const dy = (sample(x, y + 1) - sample(x, y - 1)) / 255;
      const nx = -dx * 1.35;
      const ny = dy * 1.35;
      const nz = 1;
      const length = Math.hypot(nx, ny, nz);
      normal[offset] = clamp((nx / length * 0.5 + 0.5) * 255);
      normal[offset + 1] = clamp((ny / length * 0.5 + 0.5) * 255);
      normal[offset + 2] = clamp((nz / length * 0.5 + 0.5) * 255);

      const micro = Math.min(1, Math.abs(dx) + Math.abs(dy));
      orm[offset] = clamp(225 - micro * 34);
      orm[offset + 1] = clamp(92 + micro * 82);
      orm[offset + 2] = 0;
      coat[index] = clamp(220 + micro * 28);

      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const fatty = Math.max(0, (green + blue) * 0.5 - red * 0.48);
      thickness[index] = clamp(118 + fatty * 0.7 + (255 - luminance[index]) * 0.16);
      const vascular = Math.max(0, red - green * 1.38) + Math.max(0, 92 - luminance[index]) * 0.45;
      veins[index] = clamp(vascular * 2.1);
    }
  }

  await Promise.all([
    sharp(normal, { raw: { width: size, height: size, channels: 3 } }).png().toFile(path.join(output, 'hero-normal.png')),
    sharp(orm, { raw: { width: size, height: size, channels: 3 } }).png().toFile(path.join(output, 'hero-orm.png')),
    sharp(coat, { raw: { width: size, height: size, channels: 1 } }).png().toFile(path.join(output, 'hero-coat.png')),
    sharp(thickness, { raw: { width: size, height: size, channels: 1 } }).png().toFile(path.join(output, 'hero-thickness.png')),
    sharp(veins, { raw: { width: size, height: size, channels: 1 } }).blur(0.6).png().toFile(path.join(output, 'hero-veins.png')),
  ]);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
