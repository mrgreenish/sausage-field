import {
  ACESFilmicToneMapping,
  AmbientLight,
  CapsuleGeometry,
  Clock,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  DoubleSide,
  Euler,
  FogExp2,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { OrganicAudio } from '../audio/OrganicAudio';
import {
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  QUALITY,
  WORLD_HALF,
  WORLD_SEED,
} from '../config';
import { RodSolver } from '../physics/RodSolver';
import type {
  PersistedSettings,
  QualityName,
  QualityTier,
  SausageSpec,
  VisibleBinding,
} from '../types';
import { Rng } from '../utils/rng';
import { generateWorld, nearbyIds, type GeneratedWorld } from '../world/generate';
import { terrainHeight } from '../world/terrain';
import {
  attachSausageAttributes,
  createSausageDepthMaterial,
  createSausageMaterial,
  type SausageAttributes,
  updateMaterialTime,
} from './sausageMaterial';
import {
  createProceduralGroundTexture,
  createProceduralSausageAtlas,
  loadTextureOrFallback,
  loadOptionalDataTexture,
} from './textures';

export interface FieldCallbacks {
  onProgress(progress: number, label: string): void;
  onLockChange(locked: boolean): void;
  onTouchChange(canTouch: boolean, touching: boolean): void;
  onStats(fps: number, activeRods: number, visible: number): void;
  onError(message: string): void;
}

interface SausageLayer {
  mesh: InstancedMesh;
  attributes: SausageAttributes;
  ids: number[];
  maxCount: number;
}

interface GrassShader {
  uniforms: { uTime?: { value: number } };
}

const tempObject = new Object3D();
const tempDirection = new Vector3();
const tempPoint = new Vector3();

export class FieldApp {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;

  private readonly world: GeneratedWorld;
  private readonly audio = new OrganicAudio();
  private readonly clock = new Clock();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2(0, 0);
  private readonly keys = new Set<string>();
  private readonly player = new Vector3(0, PLAYER_HEIGHT, 0);
  private readonly velocity = new Vector3();
  private readonly bindings = new Map<number, VisibleBinding>();
  private readonly frameSamples: number[] = [];
  private rods: RodSolver;
  private settings: PersistedSettings;
  private quality: QualityTier;
  private nearLayer?: SausageLayer;
  private midLayer?: SausageLayer;
  private farLayer?: SausageLayer;
  private grass?: InstancedMesh;
  private grassMaterial?: MeshBasicMaterial;
  private sausageMaterial?: ReturnType<typeof createSausageMaterial>;
  private sausageDepthMaterial?: ReturnType<typeof createSausageDepthMaterial>;
  private sun?: DirectionalLight;
  private fillLight?: PointLight;
  private sunTarget?: Object3D;
  private animationFrame = 0;
  private elapsed = 0;
  private lodElapsed = 0;
  private statsElapsed = 0;
  private yaw = 0;
  private pitch = -0.04;
  private dragging = false;
  private pressing = false;
  private locked = false;
  private fallbackActive = false;
  private paused = true;
  private touchAvailable = false;
  private autoBenchmarked = false;
  private contextLost = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    settings: PersistedSettings,
    private readonly callbacks: FieldCallbacks,
    seed = WORLD_SEED,
  ) {
    const context = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    if (!context) throw new Error('WebGL2 is unavailable on this device.');
    this.renderer = new WebGLRenderer({ canvas, context, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.settings = { ...settings };
    const requested = settings.quality === 'auto' ? 'medium' : settings.quality;
    this.quality = QUALITY[requested];
    this.rods = new RodSolver(this.quality.activeRods);
    this.camera = new PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.045, 240);
    this.camera.position.copy(this.player);
    this.world = generateWorld(seed);
  }

  async initialize(): Promise<void> {
    this.callbacks.onProgress(0.08, 'Growing terrain');
    this.setupRenderer();
    this.setupAtmosphere();
    const [sausageTexture, groundTexture, sausageNormal, sausageOrm, sausageCoat] = await Promise.all([
      loadTextureOrFallback('/assets/textures/sausage-atlas.webp', createProceduralSausageAtlas),
      loadTextureOrFallback('/assets/textures/ground-turf.webp', createProceduralGroundTexture),
      loadOptionalDataTexture('/assets/textures/sausage-normal.webp'),
      loadOptionalDataTexture('/assets/textures/sausage-orm.webp'),
      loadOptionalDataTexture('/assets/textures/sausage-coat.webp'),
    ]);
    this.callbacks.onProgress(0.34, 'Preparing living surfaces');
    groundTexture.repeat.set(22, 22);
    this.createTerrain(groundTexture);
    this.sausageMaterial = createSausageMaterial(
      sausageTexture,
      sausageNormal ?? sausageTexture,
      sausageOrm ?? sausageTexture,
      sausageCoat ?? sausageTexture,
    );
    this.sausageDepthMaterial = createSausageDepthMaterial();
    this.createSausageLayers();
    this.callbacks.onProgress(0.58, 'Planting sausages');
    this.createGrass();
    this.callbacks.onProgress(0.82, 'Waking the field');
    this.rebuildVisibleLayers();
    this.bindEvents();
    this.audio.setEnabled(this.settings.sound);
    this.callbacks.onProgress(1, 'Field ready');
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  async enter(): Promise<void> {
    if (this.contextLost) return;
    await this.audio.start();
    this.audio.setEnabled(this.settings.sound);
    this.paused = false;
    this.fallbackActive = true;
    this.callbacks.onLockChange(true);
    try {
      await this.canvas.requestPointerLock();
    } catch {
      this.locked = false;
      this.paused = false;
      this.callbacks.onLockChange(true);
    }
  }

  pause(): void {
    this.paused = true;
    this.fallbackActive = false;
    this.pressing = false;
    this.keys.clear();
    this.velocity.set(0, 0, 0);
    this.callbacks.onTouchChange(this.touchAvailable, false);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  setSettings(settings: PersistedSettings): void {
    const previousQuality = this.settings.quality;
    this.settings = { ...settings };
    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();
    this.audio.setEnabled(settings.sound);
    if (settings.quality !== 'auto' && settings.quality !== previousQuality) this.setQuality(settings.quality);
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    this.renderer.dispose();
    this.audio.suspend();
  }

  private setupRenderer(): void {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.quality.dpr));
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.scene.fog = new FogExp2(0xa9a88b, 0.0185);
    this.scene.background = new Color(0xb8af91);
  }

  private setupAtmosphere(): void {
    const sky = new Sky();
    sky.scale.setScalar(400_000);
    const uniforms = sky.material.uniforms;
    uniforms.turbidity.value = 6.4;
    uniforms.rayleigh.value = 1.8;
    uniforms.mieCoefficient.value = 0.006;
    uniforms.mieDirectionalG.value = 0.82;
    const sunPosition = new Vector3().setFromSphericalCoords(1, MathUtils.degToRad(72), MathUtils.degToRad(236));
    uniforms.sunPosition.value.copy(sunPosition);
    this.scene.add(sky);

    const pmrem = new PMREMGenerator(this.renderer);
    const environmentScene = new Scene();
    environmentScene.add(sky.clone());
    const environment = pmrem.fromScene(environmentScene, 0.035).texture;
    this.scene.environment = environment;
    pmrem.dispose();

    this.scene.add(new HemisphereLight(0xdce7e8, 0x8c765a, 3.35));
    this.scene.add(new AmbientLight(0xffe1bd, 0.56));
    this.sun = new DirectionalLight(0xffc58e, 3.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.quality.shadowSize, this.quality.shadowSize);
    this.sun.shadow.bias = -0.00012;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 85;
    this.sunTarget = new Object3D();
    this.fillLight = new PointLight(0xffd9c4, 95, 22, 1.65);
    this.fillLight.position.copy(this.player).add(new Vector3(0, 2.2, 0));
    this.scene.add(this.fillLight);
    this.scene.add(this.sunTarget, this.sun);
    this.updateSun();
  }

  private createTerrain(texture: Texture): void {
    const geometry = new PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2, 128, 128);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      positions.setY(i, terrainHeight(x, z));
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    const material = new MeshBasicMaterial({
      map: texture,
      color: 0xb1bb8d,
    });
    const terrain = new Mesh(geometry, material);
    terrain.receiveShadow = true;
    this.scene.add(terrain);
  }

  private createSausageLayers(): void {
    if (!this.sausageMaterial || !this.sausageDepthMaterial) return;
    this.nearLayer = this.createLayer(this.quality.nearCount, 10, 7);
    this.midLayer = this.createLayer(this.quality.midCount, 7, 4);
    this.farLayer = this.createLayer(this.quality.farCount, 5, 2);
  }

  private createLayer(maxCount: number, radialSegments: number, capSegments: number): SausageLayer {
    const geometry = new CapsuleGeometry(0.5, 1, capSegments, radialSegments);
    geometry.translate(0, 1, 0);
    const attributes = attachSausageAttributes(maxCount, geometry);
    const mesh = new InstancedMesh(geometry, this.sausageMaterial!, maxCount);
    mesh.count = 0;
    mesh.castShadow = radialSegments >= 7;
    mesh.receiveShadow = true;
    mesh.customDepthMaterial = this.sausageDepthMaterial!;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return { mesh, attributes, ids: [], maxCount };
  }

  private createGrass(): void {
    const geometry = new PlaneGeometry(0.052, 0.82, 1, 3);
    geometry.translate(0, 0.41, 0);
    const phases = new InstancedBufferAttribute(new Float32Array(this.quality.grassCount), 1);
    geometry.setAttribute('iPhase', phases);
    this.grassMaterial = new MeshBasicMaterial({
      color: 0x4f6e34,
      side: DoubleSide,
      vertexColors: false,
    });
    this.grassMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float iPhase;\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float grassT = clamp(position.y / 0.82, 0.0, 1.0);
           transformed.x += sin(uTime * 0.88 + iPhase) * 0.105 * grassT * grassT;
           transformed.z += cos(uTime * 0.64 + iPhase * 1.7) * 0.045 * grassT * grassT;`,
        );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        '#include <opaque_fragment>\ngl_FragColor.rgb = max(gl_FragColor.rgb, diffuseColor.rgb * 0.72);',
      );
      this.grassMaterial!.userData.shader = shader;
    };
    this.grassMaterial.customProgramCacheKey = () => 'grass-wind-v2';
    this.grassMaterial.toneMapped = false;
    this.grass = new InstancedMesh(geometry, this.grassMaterial, this.quality.grassCount);
    const rng = new Rng(4_211 + this.quality.grassCount);
    for (let i = 0; i < this.quality.grassCount; i += 1) {
      const x = rng.range(-WORLD_HALF, WORLD_HALF);
      const z = rng.range(-WORLD_HALF, WORLD_HALF);
      const height = rng.range(0.36, 1.05);
      tempObject.position.set(x, terrainHeight(x, z) - 0.015, z);
      tempObject.rotation.set(0, rng.range(0, Math.PI * 2), rng.range(-0.08, 0.08));
      tempObject.scale.set(rng.range(0.72, 1.28), height, 1);
      tempObject.updateMatrix();
      this.grass.setMatrixAt(i, tempObject.matrix);
      phases.setX(i, rng.range(0, Math.PI * 2));
    }
    this.grass.instanceMatrix.needsUpdate = true;
    phases.needsUpdate = true;
    this.grass.receiveShadow = true;
    this.grass.frustumCulled = false;
    this.scene.add(this.grass);
  }

  private rebuildVisibleLayers(): void {
    if (!this.nearLayer || !this.midLayer || !this.farLayer) return;
    const ranked = this.world.sausages
      .map((spec) => ({ spec, distance: Math.hypot(spec.x - this.player.x, spec.z - this.player.z) }))
      .filter((entry) => entry.distance < 68)
      .sort((a, b) => a.distance - b.distance);
    const near = ranked.filter((entry) => entry.distance < 13).slice(0, this.nearLayer.maxCount).map((entry) => entry.spec);
    const mid = ranked.filter((entry) => entry.distance >= 13 && entry.distance < 36).slice(0, this.midLayer.maxCount).map((entry) => entry.spec);
    const far = ranked.filter((entry) => entry.distance >= 36).slice(0, this.farLayer.maxCount).map((entry) => entry.spec);
    this.bindings.clear();
    this.populateLayer(this.nearLayer, near, 'near');
    this.populateLayer(this.midLayer, mid, 'mid');
    this.populateLayer(this.farLayer, far, 'far');
  }

  private populateLayer(layer: SausageLayer, specs: SausageSpec[], lod: VisibleBinding['lod']): void {
    layer.ids = specs.map((spec) => spec.id);
    layer.mesh.count = specs.length;
    for (let i = 0; i < specs.length; i += 1) {
      const spec = specs[i];
      tempObject.position.set(spec.x, spec.groundY, spec.z);
      tempObject.rotation.set(0, spec.yaw, 0);
      tempObject.scale.set(spec.radius * 2, spec.height * 0.5, spec.radius * 2);
      tempObject.updateMatrix();
      layer.mesh.setMatrixAt(i, tempObject.matrix);
      layer.attributes.seed.setX(i, spec.seed);
      layer.attributes.wetness.setX(i, spec.wetness);
      layer.attributes.vein.setX(i, spec.veinStrength);
      layer.attributes.family.setX(i, spec.family);
      layer.attributes.shape.setXY(i, spec.taper, spec.bulge);
      this.writeBend(layer, i, spec);
      this.bindings.set(spec.id, { lod, index: i });
    }
    layer.mesh.instanceMatrix.needsUpdate = true;
    for (const attribute of Object.values(layer.attributes)) attribute.needsUpdate = true;
  }

  private writeBend(layer: SausageLayer, index: number, spec: SausageSpec): void {
    const visual = this.rods.getVisualFor(spec.id);
    let x = visual?.bend.x ?? 0;
    let z = visual?.bend.y ?? 0;
    const c = Math.cos(spec.yaw);
    const s = Math.sin(spec.yaw);
    const localX = c * x + s * z;
    const localZ = -s * x + c * z;
    x = localX / Math.max(0.01, spec.radius * 2);
    z = localZ / Math.max(0.01, spec.radius * 2);
    layer.attributes.bend.setXY(index, x, z);
    layer.attributes.touchHeight.setX(index, visual?.touchHeight ?? 0.55);
  }

  private updateActiveBends(): void {
    if (!this.nearLayer) return;
    let dirty = false;
    for (const state of this.rods.active.values()) {
      const binding = this.bindings.get(state.spec.id);
      if (!binding || binding.lod !== 'near') continue;
      this.writeBend(this.nearLayer, binding.index, state.spec);
      dirty = true;
    }
    if (dirty) {
      this.nearLayer.attributes.bend.needsUpdate = true;
      this.nearLayer.attributes.touchHeight.needsUpdate = true;
    }
  }

  private updatePlayer(dt: number): void {
    const forwardInput = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
    const sideInput = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const running = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const targetSpeed = running ? 3.9 : 2.25;
    const forward = tempDirection.set(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = tempPoint.set(Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const desired = new Vector3().addScaledVector(forward, forwardInput).addScaledVector(right, sideInput);
    if (desired.lengthSq() > 0) desired.normalize().multiplyScalar(targetSpeed);
    const acceleration = 1 - Math.exp(-dt * 9);
    this.velocity.lerp(desired, acceleration);
    const oldX = this.player.x;
    const oldZ = this.player.z;
    this.player.x = MathUtils.clamp(this.player.x + this.velocity.x * dt, -WORLD_HALF + 3, WORLD_HALF - 3);
    this.player.z = MathUtils.clamp(this.player.z + this.velocity.z * dt, -WORLD_HALF + 3, WORLD_HALF - 3);
    this.player.y = terrainHeight(this.player.x, this.player.z) + PLAYER_HEIGHT;
    this.camera.position.copy(this.player);
    if (this.fillLight) this.fillLight.position.copy(this.player).add(tempPoint.set(0, 2.2, 0));
    this.camera.quaternion.setFromEuler(new Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.audio.setMovement(this.velocity.length());
    const travelled = Math.hypot(this.player.x - oldX, this.player.z - oldZ);
    if (travelled > 0.0001) this.handleBodyContacts(dt);
  }

  private handleBodyContacts(dt: number): void {
    const ids = nearbyIds(this.world, this.player.x, this.player.z, 1.1);
    const speed = this.velocity.length();
    for (const id of ids) {
      const spec = this.world.sausages[id];
      const dx = spec.x - this.player.x;
      const dz = spec.z - this.player.z;
      const distance = Math.hypot(dx, dz);
      if (distance > PLAYER_RADIUS + spec.radius + 0.12 || distance < 0.0001) continue;
      const direction = new Vector3(dx / distance, 0, dz / distance);
      const pressure = Math.min(0.085, dt * (0.75 + speed) * 1.5);
      this.rods.applyContact(spec, {
        source: 'player', position: this.player, direction, radius: PLAYER_RADIUS,
        pressure, normalizedHeight: 0.48,
      });
      this.audio.contact(pressure * 8, spec.firmness, spec.wetness);
    }
  }

  private updateProbe(dt: number): void {
    if (!this.nearLayer) return;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.raycaster.far = 1.5;
    const hit = this.raycaster.intersectObject(this.nearLayer.mesh, false)[0];
    this.touchAvailable = Boolean(hit && hit.distance <= 1.5 && hit.instanceId !== undefined);
    let touching = false;
    if (this.touchAvailable && hit?.instanceId !== undefined) {
      const id = this.nearLayer.ids[hit.instanceId];
      const spec = this.world.sausages[id];
      if (this.pressing) {
        const direction = this.raycaster.ray.direction.clone();
        direction.y = 0;
        if (direction.lengthSq() < 0.001) direction.set(0, 0, -1);
        direction.normalize();
        const height = MathUtils.clamp((hit.point.y - spec.groundY) / spec.height, 0.08, 0.98);
        const pressure = Math.min(0.07, dt * 2.9);
        this.rods.applyContact(spec, {
          source: 'probe', position: hit.point, direction, radius: 0.08,
          pressure, normalizedHeight: height,
        });
        this.audio.contact(pressure * 9, spec.firmness, spec.wetness);
        touching = true;
      }
    } else {
    }
    this.callbacks.onTouchChange(this.touchAvailable, touching);
  }

  private updateSun(): void {
    if (!this.sun || !this.sunTarget) return;
    this.sunTarget.position.set(this.player.x, terrainHeight(this.player.x, this.player.z), this.player.z);
    this.sun.position.set(this.player.x - 28, this.player.y + 34, this.player.z + 19);
    this.sun.target = this.sunTarget;
    const radius = this.quality.shadowRadius;
    const camera = this.sun.shadow.camera;
    camera.left = -radius;
    camera.right = radius;
    camera.top = radius;
    camera.bottom = -radius;
    camera.updateProjectionMatrix();
  }

  private setQuality(name: QualityName): void {
    if (this.quality.name === name) return;
    this.quality = QUALITY[name];
    this.rods.setLimit(this.quality.activeRods);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.quality.dpr));
    this.renderer.setSize(innerWidth, innerHeight, false);
    if (this.sun) {
      this.sun.shadow.mapSize.set(this.quality.shadowSize, this.quality.shadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    for (const layer of [this.nearLayer, this.midLayer, this.farLayer]) {
      if (layer) {
        this.scene.remove(layer.mesh);
        layer.mesh.geometry.dispose();
      }
    }
    if (this.grass) {
      this.scene.remove(this.grass);
      this.grass.geometry.dispose();
    }
    this.createSausageLayers();
    this.createGrass();
    this.rebuildVisibleLayers();
    this.updateSun();
  }

  private benchmark(frameMs: number): void {
    if (this.settings.quality !== 'auto' || this.autoBenchmarked || this.elapsed < 1) return;
    this.frameSamples.push(frameMs);
    if (this.elapsed < 5 || this.frameSamples.length < 90) return;
    this.frameSamples.sort((a, b) => a - b);
    const p95 = this.frameSamples[Math.floor(this.frameSamples.length * 0.95)];
    this.autoBenchmarked = true;
    if (p95 < 14) this.setQuality('high');
    else if (p95 > 22) this.setQuality('low');
  }

  private bindEvents(): void {
    addEventListener('resize', this.onResize);
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('mousemove', this.onMouseMove);
    addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  private onResize = (): void => {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    this.keys.add(event.code);
    if (event.code === 'Escape') this.pause();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private onMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    if (this.locked) this.pressing = true;
    else if (this.fallbackActive) {
      this.dragging = true;
      this.pressing = true;
    }
  };

  private onMouseUp = (): void => {
    this.pressing = false;
    this.dragging = false;
  };

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.locked && !this.dragging) return;
    const factor = 0.00125 * this.settings.sensitivity;
    this.yaw -= event.movementX * factor;
    const invert = this.settings.invertY ? -1 : 1;
    this.pitch -= event.movementY * factor * invert;
    this.pitch = MathUtils.clamp(this.pitch, -1.35, 1.25);
  };

  private onPointerLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked && !this.fallbackActive) {
      this.pressing = false;
      this.keys.clear();
      this.velocity.set(0, 0, 0);
      this.paused = true;
    } else {
      this.paused = false;
    }
    if (this.locked) this.fallbackActive = false;
    this.callbacks.onLockChange(this.locked || this.fallbackActive);
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) this.pause();
  };

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.paused = true;
    this.callbacks.onError('The graphics context was lost. Waiting for the browser to restore the field…');
  };

  private onContextRestored = (): void => {
    location.reload();
  };

  private animate = (): void => {
    this.animationFrame = requestAnimationFrame(this.animate);
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 1 / 20);
    this.elapsed += dt;
    if (!this.paused && !this.contextLost) {
      this.updatePlayer(dt);
      this.updateProbe(dt);
      this.rods.step(dt, this.elapsed);
      this.updateActiveBends();
      this.lodElapsed += dt;
      if (this.lodElapsed > 0.48) {
        this.lodElapsed = 0;
        this.rebuildVisibleLayers();
        this.updateSun();
      }
    }
    if (this.sausageMaterial) updateMaterialTime(this.sausageMaterial, this.elapsed);
    if (this.sausageDepthMaterial) updateMaterialTime(this.sausageDepthMaterial, this.elapsed);
    const grassShader = this.grassMaterial?.userData.shader as GrassShader | undefined;
    if (grassShader?.uniforms.uTime) grassShader.uniforms.uTime.value = this.elapsed;
    this.renderer.render(this.scene, this.camera);
    this.benchmark(rawDt * 1000);
    this.statsElapsed += rawDt;
    if (this.statsElapsed > 0.5) {
      const fps = Math.round(1 / Math.max(0.001, rawDt));
      const visible = (this.nearLayer?.mesh.count ?? 0) + (this.midLayer?.mesh.count ?? 0) + (this.farLayer?.mesh.count ?? 0);
      this.callbacks.onStats(fps, this.rods.active.size, visible);
      this.statsElapsed = 0;
    }
  };
}
