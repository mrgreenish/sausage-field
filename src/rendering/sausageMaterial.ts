import {
  BufferGeometry,
  InstancedBufferAttribute,
  MeshBasicMaterial,
  MeshDepthMaterial,
  RGBADepthPacking,
  Texture,
} from 'three';

interface ShaderLike {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
}

export interface SausageAttributes {
  bend: InstancedBufferAttribute;
  touchHeight: InstancedBufferAttribute;
  seed: InstancedBufferAttribute;
  wetness: InstancedBufferAttribute;
  vein: InstancedBufferAttribute;
  family: InstancedBufferAttribute;
  shape: InstancedBufferAttribute;
}

export function attachSausageAttributes(maxCount: number, geometry: BufferGeometry): SausageAttributes {
  const attributes: SausageAttributes = {
    bend: new InstancedBufferAttribute(new Float32Array(maxCount * 2), 2),
    touchHeight: new InstancedBufferAttribute(new Float32Array(maxCount).fill(0.55), 1),
    seed: new InstancedBufferAttribute(new Float32Array(maxCount), 1),
    wetness: new InstancedBufferAttribute(new Float32Array(maxCount), 1),
    vein: new InstancedBufferAttribute(new Float32Array(maxCount), 1),
    family: new InstancedBufferAttribute(new Float32Array(maxCount), 1),
    shape: new InstancedBufferAttribute(new Float32Array(maxCount * 2), 2),
  };
  geometry.setAttribute('iBend', attributes.bend);
  geometry.setAttribute('iTouchHeight', attributes.touchHeight);
  geometry.setAttribute('iSeed', attributes.seed);
  geometry.setAttribute('iWetness', attributes.wetness);
  geometry.setAttribute('iVein', attributes.vein);
  geometry.setAttribute('iFamily', attributes.family);
  geometry.setAttribute('iShape', attributes.shape);
  return attributes;
}

const declarations = `
  attribute vec2 iBend;
  attribute float iTouchHeight;
  attribute float iSeed;
  attribute float iWetness;
  attribute float iVein;
  attribute float iFamily;
  attribute vec2 iShape;
  uniform float uTime;
  varying vec2 vSausageUv;
  varying float vSausageSeed;
  varying float vSausageWetness;
  varying float vSausageVein;
  varying float vSausageFamily;
`;

const vertexStart = `
  vSausageUv = uv;
  vSausageSeed = iSeed;
  vSausageWetness = iWetness;
  vSausageVein = iVein;
  vSausageFamily = iFamily;
`;

const vertexTransform = `
  vec3 transformed = vec3(position);
  float sausageT = clamp(position.y * 0.5, 0.0, 1.0);
  float contactH = max(0.08, iTouchHeight);
  float belowContact = smoothstep(0.0, contactH, sausageT);
  float aboveContact = max(0.0, sausageT - contactH) / max(0.08, 1.0 - contactH);
  float bendProfile = belowContact * belowContact * (3.0 - 2.0 * belowContact);
  bendProfile *= 1.0 + aboveContact * 0.28;
  float windProfile = sausageT * sausageT;
  vec2 wind = vec2(
    sin(uTime * 0.77 + iSeed * 34.1),
    cos(uTime * 0.61 + iSeed * 21.7)
  ) * 0.035 * windProfile;
  transformed.xz += iBend * bendProfile + wind;
  float organic = 1.0 + sin(sausageT * 12.0 + iSeed * 18.0) * iShape.y;
  float tapered = mix(1.0, iShape.x, smoothstep(0.28, 1.0, sausageT));
  transformed.xz *= organic * tapered;
`;

function patchVertex(shader: ShaderLike): void {
  shader.uniforms.uTime = { value: 0 };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${declarations}`)
    .replace('#include <begin_vertex>', `${vertexStart}\n${vertexTransform}`)
    .replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
       float normalT = clamp(position.y * 0.5, 0.0, 1.0);
       objectNormal.xz -= iBend * normalT * 0.22;`,
    );
}

export function createSausageMaterial(texture: Texture, normal: Texture, orm: Texture, coat: Texture): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
  });
  material.onBeforeCompile = (shader) => {
    patchVertex(shader);
    shader.uniforms.uSausageNormal = { value: normal };
    shader.uniforms.uSausageOrm = { value: orm };
    shader.uniforms.uSausageCoat = { value: coat };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec2 vSausageUv;
         varying float vSausageSeed;
         varying float vSausageWetness;
         varying float vSausageVein;
         varying float vSausageFamily;
         uniform sampler2D uSausageNormal;
         uniform sampler2D uSausageOrm;
         uniform sampler2D uSausageCoat;

         float vesselLine(float x, float center, float width) {
           float d = abs(fract(x - center + 0.5) - 0.5);
           return 1.0 - smoothstep(width, width * 2.5, d);
         }`,
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
           float family = floor(vSausageFamily + 0.5);
           vec2 tile = vec2(mod(family, 2.0), floor(family * 0.5));
           vec2 localUv = fract(vSausageUv * vec2(1.07, 1.72) + vec2(vSausageSeed, vSausageSeed * 0.37));
           vec2 atlasUv = tile * 0.5 + localUv * 0.48 + 0.01;
           vec4 sampledDiffuseColor = texture2D(map, atlasUv);
           diffuseColor *= sampledDiffuseColor;
         #endif
         float y = vSausageUv.y;
         float mainCenter = 0.48 + sin(y * 8.0 + vSausageSeed * 31.0) * 0.105;
         float vessels = vesselLine(vSausageUv.x, mainCenter, mix(0.006, 0.018, vSausageVein));
         float branchGateA = smoothstep(0.22, 0.28, y) * (1.0 - smoothstep(0.48, 0.55, y));
         float branchGateB = smoothstep(0.56, 0.62, y) * (1.0 - smoothstep(0.83, 0.9, y));
         float branchA = vesselLine(vSausageUv.x, mainCenter + (y - 0.28) * 0.7, 0.008) * branchGateA;
         float branchB = vesselLine(vSausageUv.x, mainCenter - (y - 0.62) * 0.58, 0.007) * branchGateB;
         vessels = clamp(vessels + branchA + branchB, 0.0, 1.0) * vSausageVein;
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.20, 0.018, 0.028), vessels * 0.78);
         vec3 detailNormal = texture2D(uSausageNormal, atlasUv).rgb * 2.0 - 1.0;
         float derivedRoughness = texture2D(uSausageOrm, atlasUv).g;
         float derivedCoat = texture2D(uSausageCoat, atlasUv).r;
         float wetBand = pow(max(0.0, sin((vSausageUv.x + sin(y * 5.0 + vSausageSeed * 9.0) * 0.08) * 6.28318) * 0.5 + 0.5), 22.0);
         float wetResponse = derivedCoat * (1.0 - derivedRoughness * 0.38) * (0.72 + detailNormal.z * 0.28);
         diffuseColor.rgb += vec3(1.0, 0.72, 0.62) * wetBand * wetResponse * vSausageWetness * 0.34;`,
      );
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => 'sausage-material-v3';
  return material;
}

export function createSausageDepthMaterial(): MeshDepthMaterial {
  const material = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  material.onBeforeCompile = (shader) => {
    patchVertex(shader);
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => 'sausage-depth-v3';
  return material;
}

export function updateMaterialTime(material: MeshBasicMaterial | MeshDepthMaterial, time: number): void {
  const shader = material.userData.shader as ShaderLike | undefined;
  if (shader?.uniforms.uTime) shader.uniforms.uTime.value = time;
}
