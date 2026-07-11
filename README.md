# Sausage Field

A deterministic desktop WebGL2 field study built with Vite, TypeScript, and Three.js. Thousands of wet, vascular sausage plants are instanced at three detail levels; touched plants wake into a fixed-step seven-node rod simulation.

The workspace also contains a higher-fidelity cross-engine path built from one shared hero asset:

- `webgpu/`: Babylon.js/WebGPU material and interaction slice, with WebGL2 fallback.
- `unreal/SausageFieldUE/`: Unreal Engine 5.8 visual-reference scaffold.
- `art/blender/`: procedural Blender source, generator, rig, LOD exports, and reference render.
- `shared-assets/`: engine-neutral GLB/FBX models, PBR maps, environment lighting, and asset contract.

## Run

```bash
pnpm install
pnpm dev
```

Click **Enter the field**, then use WASD/arrow keys and mouse look. Hold the primary mouse button when the reticle opens to press and stroke a nearby plant. Walking into plants also bends them.

For the higher-fidelity Babylon study:

```bash
cd webgpu
pnpm install
pnpm dev
```

It uses WebGPU when available and automatically falls back to WebGL2. Click **Enter study**, use WASD and mouse look, and hold the primary button over a specimen to press it. If pointer lock is unavailable, click-drag look remains available.

## Deploy to Vercel

The repository-level `vercel.json` builds the Babylon/WebGPU study and publishes `webgpu/dist`. No environment variables or backend services are required.

```bash
pnpm install --frozen-lockfile
pnpm --filter sausage-field-webgpu-slice build
```

## Shared hero workflow

```bash
pnpm hero:build
```

This derives aligned PBR maps, runs Blender headlessly, saves the editable `.blend`, renders a reference frame, and exports three skeletal LODs as GLB and FBX. The engine contract is recorded in `shared-assets/sausage-asset-manifest.json`.

Once Unreal Engine 5.8 is installed, open `unreal/SausageFieldUE/SausageFieldUE.uproject` and run `Content/Python/import_shared_assets.py` from Unreal's Python console to import the same assets and assemble the reference map.

## Material sources

The exact built-in ImageGen prompts are preserved in `assets/imagegen/prompts.md`. Source files use these names:

- `sausage-pale.png`
- `sausage-rose.png`
- `sausage-fatty.png`
- `sausage-coarse.png`
- `ground-turf.png`
- `ground-macro.png`

Run `pnpm textures` to repair seams, assemble the atlas, and derive aligned normal, ORM, and wet-coat maps under `public/assets/textures/`.

## QA interfaces

- `?seed=<uint32>` selects a deterministic field.
- `?quality=low|medium|high` pins a quality tier.
- `?debug=1` shows FPS, visible instance count, and awake rods.
- Settings persist under `sausage-field.settings.v1`.

## Verify

```bash
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```
