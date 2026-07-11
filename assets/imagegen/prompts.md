# ImageGen source prompts

Mode: built-in ImageGen. Use case: `photorealistic-natural`. These images are diffuse material sources, not finished PBR maps. Every approved output is copied into this folder and processed with `pnpm textures`.

## Sausage families

Use the following prompt once for each named variant: `pale fine emulsion`, `rose-red medium grain`, `fat-rich pink with thick ivory marbling`, and `coarse dark-red with large meat and fat grains`.

```text
Use case: photorealistic-natural
Asset type: seamless tileable WebGL diffuse material source
Primary request: edge-to-edge orthographic material scan of uncooked natural sausage casing; pink-red lean meat and ivory fat visible beneath the casing; VARIANT; a few genuine branching subdermal blood vessels; irregular natural distribution
Style/medium: photorealistic cross-polarized material scan, diffuse pigmentation only
Composition/framing: square, flat, edge-to-edge surface with no object silhouette
Lighting/mood: neutral D65, perfectly even and flat
Materials/textures: casing pores, shallow wrinkles, meat grain, fat inclusions
Constraints: equal brightness at every edge; visually seamless; no baked gloss, shadow, white highlight, or ambient occlusion
Avoid: whole sausage, cut ends, plate, hands, wounds, flowing blood, gore, cooked or charred areas, depth of field, perspective, repeating focal blobs, text, logo, watermark
```

## Ground close turf

```text
Use case: photorealistic-natural
Asset type: seamless top-down WebGL field diffuse material source
Primary request: dense natural meadow turf with mixed fine grass species, sparse clover, dry blades, and occasional soil glimpses
Style/medium: orthographic photogrammetry-like diffuse material scan
Composition/framing: square, straight top-down, edge-to-edge ground
Lighting/mood: neutral overcast D65, flat and shadowless
Constraints: seamless in both axes; uniform density and edge brightness; no unique focal element
Avoid: horizon, perspective, footprints, paths, rocks, large flowers, hard shadows, depth of field, obvious repeated clumps, text, logo, watermark
```

## Ground macro variation

```text
Use case: photorealistic-natural
Asset type: seamless top-down WebGL meadow macro-color source
Primary request: broad natural meadow color variation seen from directly above, subtle patches of deep green, olive grass, dry straw and darker damp turf
Style/medium: orthographic aerial diffuse reference with no visible individual blades
Composition/framing: square, edge-to-edge low-frequency color variation
Lighting/mood: neutral overcast D65, flat and shadowless
Constraints: seamless in both axes; no dominant focal patch; no baked shadows
Avoid: horizon, paths, objects, flowers, text, logo, watermark
```
