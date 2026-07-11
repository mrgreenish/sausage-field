import './styles.css';
import '@babylonjs/loaders/glTF';
import {
  Color3, Color4, CubeTexture, DefaultRenderingPipeline, DirectionalLight, Engine,
  HemisphericLight, Matrix, Mesh, MeshBuilder, PBRMaterial, Quaternion, Scene,
  SceneLoader, ShadowGenerator, Texture, UniversalCamera, Vector3, WebGPUEngine,
  type AbstractEngine, type TransformNode,
} from '@babylonjs/core';

const canvas = document.querySelector<HTMLCanvasElement>('#renderCanvas')!;
const entry = document.querySelector<HTMLElement>('#entry')!;
const status = document.querySelector<HTMLElement>('#status')!;
const enter = document.querySelector<HTMLButtonElement>('#enter')!;
const reticle = document.querySelector<HTMLElement>('#reticle')!;
const settingsPanel = document.querySelector<HTMLElement>('#settings')!;
const settingsButton = document.querySelector<HTMLButtonElement>('#settingsButton')!;
const closeSettings = document.querySelector<HTMLButtonElement>('#closeSettings')!;
const sensitivity = document.querySelector<HTMLInputElement>('#sensitivity')!;
const fov = document.querySelector<HTMLInputElement>('#fov')!;
const invertY = document.querySelector<HTMLInputElement>('#invertY')!;
const sound = document.querySelector<HTMLInputElement>('#sound')!;
const reducedMotion = document.querySelector<HTMLInputElement>('#reducedMotion')!;

interface Settings { sensitivity: number; fov: number; invertY: boolean; sound: boolean; reducedMotion: boolean }
interface PlantState {
  root: TransformNode; restRotation: Quaternion; bend: Vector3; velocity: Vector3;
  firmness: number; moisture: number; height: number; radius: number; lastContact: number;
}

const SETTINGS_KEY = 'sausage-field.settings.v1';
const defaults: Settings = { sensitivity: 0.5, fov: 64, invertY: false, sound: true, reducedMotion: false };
const saved = (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}'); } catch { return {}; } })();
const prefs: Settings = { ...defaults, ...saved };

function seeded(index: number, salt = 0): number {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

class FieldAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private wind?: AudioBufferSourceNode;
  private contactGain?: GainNode;
  private contactFilter?: BiquadFilterNode;
  enabled = prefs.sound;

  async start(): Promise<void> {
    if (!this.enabled) return;
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.2;
      this.master.connect(this.context.destination);
      const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.35;
      this.wind = this.context.createBufferSource();
      this.wind.buffer = buffer; this.wind.loop = true;
      const windFilter = this.context.createBiquadFilter();
      windFilter.type = 'lowpass'; windFilter.frequency.value = 620;
      const windGain = this.context.createGain(); windGain.gain.value = 0.045;
      this.wind.connect(windFilter).connect(windGain).connect(this.master);
      this.wind.start();
      this.contactFilter = this.context.createBiquadFilter();
      this.contactFilter.type = 'bandpass'; this.contactFilter.Q.value = 1.2;
      this.contactGain = this.context.createGain(); this.contactGain.gain.value = 0;
      const contactNoise = this.context.createBufferSource(); contactNoise.buffer = buffer; contactNoise.loop = true;
      contactNoise.connect(this.contactFilter).connect(this.contactGain).connect(this.master); contactNoise.start();
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  contact(pressure: number, moisture: number, firmness: number): void {
    if (!this.context || !this.contactGain || !this.contactFilter || !this.enabled) return;
    const now = this.context.currentTime;
    this.contactGain.gain.setTargetAtTime(Math.min(0.22, pressure * (0.08 + moisture * 0.12)), now, 0.025);
    this.contactFilter.frequency.setTargetAtTime(240 + firmness * 620, now, 0.03);
  }

  release(): void {
    if (this.context && this.contactGain) this.contactGain.gain.setTargetAtTime(0, this.context.currentTime, 0.07);
  }
}

async function createEngine(): Promise<{ engine: AbstractEngine; backend: string }> {
  if (await WebGPUEngine.IsSupportedAsync) {
    const engine = new WebGPUEngine(canvas, { antialias: true });
    await engine.initAsync();
    return { engine, backend: 'WebGPU' };
  }
  return { engine: new Engine(canvas, true, { stencil: true }), backend: 'WebGL2 fallback' };
}

function makeGrass(scene: Scene): void {
  const blade = MeshBuilder.CreatePlane('GrassBlades', { width: 0.032, height: 0.38, sideOrientation: Mesh.DOUBLESIDE }, scene);
  blade.bakeTransformIntoVertices(Matrix.Translation(0, 0.19, 0));
  const material = new PBRMaterial('GrassBladePBR', scene);
  material.albedoColor = new Color3(0.10, 0.29, 0.055); material.roughness = 0.88;
  material.metallic = 0; material.backFaceCulling = false; blade.material = material;
  const count = 6500;
  const matrices = new Float32Array(count * 16);
  for (let i = 0; i < count; i++) {
    const x = (seeded(i, 1) - 0.5) * 23.5;
    const z = (seeded(i, 2) - 0.5) * 23.5;
    const scale = 0.52 + seeded(i, 3) * 0.9;
    const matrix = Matrix.Compose(
      new Vector3(0.7 + seeded(i, 4) * 0.55, scale, 1),
      Quaternion.FromEulerAngles(0, seeded(i, 5) * Math.PI * 2, (seeded(i, 6) - 0.5) * 0.16),
      new Vector3(x, 0.012, z),
    );
    matrix.copyToArray(matrices, i * 16);
  }
  blade.thinInstanceSetBuffer('matrix', matrices, 16, true);
  blade.freezeWorldMatrix();
}

async function main(): Promise<void> {
  const { engine, backend } = await createEngine();
  const audio = new FieldAudio();
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.62, 0.66, 0.55, 1);
  scene.fogMode = Scene.FOGMODE_EXP2; scene.fogDensity = 0.018; scene.fogColor = new Color3(0.64, 0.66, 0.56);
  scene.environmentTexture = CubeTexture.CreateFromPrefilteredData('/environment.env', scene);
  scene.environmentIntensity = 0.78;
  const prePass = scene.enableSubSurfaceForPrePass(); if (prePass) prePass.metersPerUnit = 1;

  const camera = new UniversalCamera('FieldCamera', new Vector3(0, 1.62, -5.8), scene);
  camera.minZ = 0.03; camera.fov = prefs.fov * Math.PI / 180; camera.speed = 0.085;
  camera.angularSensibility = 4700 - prefs.sensitivity * 3600;
  camera.keysUp.push(87); camera.keysDown.push(83); camera.keysLeft.push(65); camera.keysRight.push(68);
  camera.checkCollisions = true; camera.ellipsoid = new Vector3(0.34, 0.82, 0.34);
  camera.attachControl(canvas, true); camera.setTarget(new Vector3(0, 0.9, 0));

  const sky = new HemisphericLight('HumidSky', new Vector3(0.25, 1, 0.15), scene);
  sky.intensity = 0.72; sky.diffuse = new Color3(0.74, 0.84, 0.92); sky.groundColor = new Color3(0.24, 0.18, 0.13);
  const sun = new DirectionalLight('LateSun', new Vector3(-0.62, -0.72, 0.28), scene);
  sun.position = new Vector3(18, 24, -12); sun.intensity = 3.6; sun.diffuse = new Color3(1, 0.66, 0.42);
  const shadows = new ShadowGenerator(2048, sun); shadows.usePercentageCloserFiltering = true;

  const ground = MeshBuilder.CreateGround('MeadowGround', { width: 24, height: 24, subdivisions: 32 }, scene);
  const groundMaterial = new PBRMaterial('MeadowPBR', scene);
  const turf = new Texture('/textures/ground-turf.webp', scene); turf.uScale = turf.vScale = 12;
  groundMaterial.albedoTexture = turf; groundMaterial.albedoColor = new Color3(0.2, 0.34, 0.11);
  groundMaterial.metallic = 0; groundMaterial.roughness = 0.94; ground.material = groundMaterial;
  ground.receiveShadows = true; ground.checkCollisions = true; makeGrass(scene);

  status.textContent = `Loading shared hero asset · ${backend}`;
  const imported = await SceneLoader.ImportMeshAsync('', '/models/', 'sausage-hero-high.glb', scene);
  const sourceRoot = imported.meshes[0]; sourceRoot.setEnabled(false);
  const families = [
    new Color3(1.00, 0.82, 0.78), new Color3(1.00, 0.70, 0.68),
    new Color3(1.00, 0.88, 0.82), new Color3(0.78, 0.48, 0.44),
  ].map((tint, index) => {
    const material = new PBRMaterial(`CasingFamily${index}`, scene);
    material.albedoTexture = new Texture('/textures/hero-basecolor.png', scene); material.albedoColor = tint;
    material.bumpTexture = new Texture('/textures/hero-normal.png', scene); material.bumpTexture.level = 0.5;
    material.metallicTexture = new Texture('/textures/hero-orm.png', scene);
    material.useRoughnessFromMetallicTextureGreen = true; material.useMetallnessFromMetallicTextureBlue = true;
    material.metallic = 0; material.roughness = 0.3 + index * 0.055; material.indexOfRefraction = 1.42;
    material.clearCoat.isEnabled = true; material.clearCoat.intensity = 0.65 + index * 0.1;
    material.clearCoat.roughness = 0.06 + index * 0.02; material.clearCoat.texture = new Texture('/textures/hero-coat.png', scene);
    material.subSurface.isTranslucencyEnabled = true; material.subSurface.isScatteringEnabled = true;
    material.subSurface.translucencyIntensity = 0.18; material.subSurface.minimumThickness = 0.015;
    material.subSurface.maximumThickness = 0.095; material.subSurface.tintColor = new Color3(0.72, 0.16, 0.12);
    material.subSurface.scatteringDiffusionProfile = new Color3(0.76, 0.22, 0.17);
    material.subSurface.thicknessTexture = new Texture('/textures/hero-thickness.png', scene);
    return material;
  });

  const positions = [
    [-2.5,.1],[-1.4,.25],[-.25,0],[1.1,.2],[2.35,-.05],[-2.8,1.8],[-1.7,1.65],[-.55,1.9],[.65,1.68],[1.85,1.88],[2.75,1.58],
    [-2.55,3.55],[-1.25,3.35],[.05,3.65],[1.4,3.4],[2.65,3.6],[-1.85,5.1],[-.55,5],[.85,5.2],[2.15,5],
  ];
  const plants: PlantState[] = positions.map(([x, z], index) => {
    const root = sourceRoot.clone(`Sausage_${index}`, null, false)!; root.setEnabled(true); root.position.set(x, 0, z);
    root.rotationQuaternion = Quaternion.FromEulerAngles((seeded(index, 8)-.5)*.08, index*1.73, (seeded(index, 9)-.5)*.1);
    const scale = .78 + seeded(index, 10) * .48; const girth = index % 5 === 0 ? 1.32 : .86 + seeded(index, 11) * .25;
    root.scaling.set(scale * girth, scale, scale * girth);
    root.getChildMeshes().forEach(mesh => {
      mesh.setEnabled(true);
      mesh.material = families[index % 4]; mesh.receiveShadows = true;
      shadows.addShadowCaster(mesh); mesh.metadata = { plantIndex: index };
    });
    return { root, restRotation: root.rotationQuaternion.clone(), bend: Vector3.Zero(), velocity: Vector3.Zero(),
      firmness: .18 + seeded(index, 12) * .78, moisture: .35 + seeded(index, 13) * .65,
      height: 1.4 * scale, radius: .16 * scale * girth, lastContact: 0 };
  });

  const pipeline = new DefaultRenderingPipeline('PhotorealPipeline', true, scene, [camera]);
  pipeline.samples = 4; pipeline.fxaaEnabled = true; pipeline.bloomEnabled = false;
  pipeline.sharpenEnabled = true; pipeline.sharpen.edgeAmount = .2; pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.contrast = 1.12; pipeline.imageProcessing.exposure = 1.03;

  let pressing = false, activePlant = -1, dragLook = false, pointerLockRequested = false, paused = false;
  const release = () => { pressing = false; activePlant = -1; reticle.classList.remove('active'); audio.release(); };
  canvas.addEventListener('pointerdown', () => { pressing = true; void audio.start(); });
  canvas.addEventListener('pointermove', event => {
    if (document.pointerLockElement === canvas || !dragLook || event.buttons === 0) return;
    camera.cameraRotation.y += event.movementX / camera.angularSensibility;
    camera.cameraRotation.x += event.movementY / camera.angularSensibility * (prefs.invertY ? 1 : -1);
  });
  addEventListener('pointerup', release);
  enter.addEventListener('click', async () => {
    entry.classList.add('hidden'); settingsPanel.classList.add('hidden'); reticle.classList.add('visible'); paused = false;
    await audio.start(); pointerLockRequested = true;
    try { await canvas.requestPointerLock(); } catch { dragLook = true; pointerLockRequested = false; status.textContent = `${backend} · drag-look fallback`; }
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) { pointerLockRequested = false; dragLook = false; return; }
    if (pointerLockRequested || dragLook) return;
    entry.classList.remove('hidden'); reticle.classList.remove('visible', 'active'); paused = true; release();
  });
  addEventListener('blur', () => { paused = true; release(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { paused = true; release(); } });
  addEventListener('keydown', event => {
    camera.speed = event.shiftKey ? .15 : .085;
    if (event.key === 'Escape' && dragLook) {
      dragLook = false; paused = true; release();
      entry.classList.remove('hidden'); reticle.classList.remove('visible', 'active', 'available');
    }
  });
  addEventListener('keyup', event => { if (event.key === 'Shift') camera.speed = .085; });

  function persist(): void {
    prefs.sensitivity = +sensitivity.value; prefs.fov = +fov.value; prefs.invertY = invertY.checked;
    prefs.sound = sound.checked; prefs.reducedMotion = reducedMotion.checked; audio.enabled = prefs.sound;
    camera.angularSensibility = 4700 - prefs.sensitivity * 3600; camera.fov = prefs.fov * Math.PI / 180;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(prefs));
  }
  sensitivity.value = String(prefs.sensitivity); fov.value = String(prefs.fov); invertY.checked = prefs.invertY;
  sound.checked = prefs.sound; reducedMotion.checked = prefs.reducedMotion;
  [sensitivity, fov, invertY, sound, reducedMotion].forEach(control => control.addEventListener('input', persist));
  settingsButton.addEventListener('click', () => settingsPanel.classList.toggle('hidden'));
  closeSettings.addEventListener('click', () => settingsPanel.classList.add('hidden'));

  let lastTime = performance.now(), accumulator = 0, walkPhase = 0;
  scene.onBeforeRenderObservable.add(() => {
    const now = performance.now(); const frameDt = Math.min(.05, (now-lastTime)/1000); lastTime = now;
    if (paused) return; accumulator += frameDt;
    const pick = scene.pick(engine.getRenderWidth()/2, engine.getRenderHeight()/2, mesh => mesh.metadata?.plantIndex !== undefined, false, camera);
    activePlant = pick?.hit && pick.distance <= 1.55 && pick.pickedMesh ? pick.pickedMesh.metadata.plantIndex as number : -1;
    reticle.classList.toggle('available', activePlant >= 0); reticle.classList.toggle('active', pressing && activePlant >= 0);
    while (accumulator >= 1/60) {
      const dt = 1/60; accumulator -= dt;
      plants.forEach((plant, index) => {
        let contact = 0;
        if (pressing && index === activePlant && pick?.pickedPoint) {
          const contactHeight = Math.max(.15, Math.min(1, pick.pickedPoint.y / plant.height));
          const forward = camera.getForwardRay().direction; const leverage = .25 + contactHeight * .95;
          contact = (1.08 - plant.firmness * .66) * leverage;
          plant.velocity.x += forward.z * contact * dt * 6.4; plant.velocity.z -= forward.x * contact * dt * 6.4;
          plant.lastContact = now; audio.contact(contact, plant.moisture, plant.firmness);
        }
        const dx = plant.root.position.x - camera.position.x, dz = plant.root.position.z - camera.position.z;
        const distance = Math.hypot(dx, dz), overlap = plant.radius + .38 - distance;
        if (overlap > 0 && distance > .001) {
          plant.velocity.x += dx / distance * overlap * dt * 18; plant.velocity.z += dz / distance * overlap * dt * 18;
          plant.lastContact = now;
        }
        const wind = Math.sin(now*.0012 + index*1.71) * .008 * (1-plant.firmness);
        const stiffness = 7 + plant.firmness*16;
        plant.velocity.x += (-plant.bend.x*stiffness + wind) * dt; plant.velocity.z += -plant.bend.z*stiffness*dt;
        plant.velocity.scaleInPlace(Math.exp(-(3.5+plant.firmness*2.8)*dt)); plant.bend.addInPlace(plant.velocity.scale(dt));
        const limit = .16 + (1-plant.firmness)*.4; if (plant.bend.length() > limit) plant.bend.normalize().scaleInPlace(limit);
        plant.root.rotationQuaternion = Quaternion.FromEulerAngles(plant.bend.z, 0, -plant.bend.x).multiply(plant.restRotation);
      });
    }
    const moving = camera.cameraDirection.lengthSquared() > .000001;
    if (moving && !prefs.reducedMotion) { walkPhase += frameDt*9; camera.position.y = 1.62 + Math.sin(walkPhase)*.012; }
    else camera.position.y += (1.62-camera.position.y)*Math.min(1, frameDt*8);
  });

  status.textContent = `${backend} ready · 20 specimens · 6,500 grass blades`; enter.disabled = false;
  engine.runRenderLoop(() => scene.render()); addEventListener('resize', () => engine.resize());
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); paused = true; status.textContent = 'Graphics context lost · reload to recover'; entry.classList.remove('hidden'); });
}

main().catch((error: unknown) => { status.textContent = error instanceof Error ? error.message : String(error); });
