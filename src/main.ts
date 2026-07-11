import './styles.css';
import { DEFAULT_SETTINGS, STORAGE_KEY, WORLD_SEED } from './config';
import { FieldApp } from './rendering/FieldApp';
import type { PersistedSettings, QualityName } from './types';

const canvas = document.querySelector<HTMLCanvasElement>('#world');
const root = document.querySelector<HTMLDivElement>('#app');
if (!canvas || !root) throw new Error('Application shell is missing.');

const params = new URLSearchParams(location.search);
const debug = params.get('debug') === '1';
const queryQuality = params.get('quality');
const querySeed = Number(params.get('seed')) || WORLD_SEED;

function loadSettings(): PersistedSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<PersistedSettings>;
    const merged = { ...DEFAULT_SETTINGS, ...saved };
    if (queryQuality === 'low' || queryQuality === 'medium' || queryQuality === 'high') merged.quality = queryQuality;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) merged.reducedMotion = true;
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let settings = loadSettings();
let field: FieldApp | undefined;
let ready = false;
let started = false;

root.innerHTML = `
  <div class="grain" aria-hidden="true"></div>
  <section class="entry" id="entry" aria-labelledby="title">
    <div class="entry__veil"></div>
    <div class="entry__content">
      <p class="eyebrow">An organic field study</p>
      <h1 id="title">Sausage<br><i>Field</i></h1>
      <p class="lede">Walk softly. Every specimen has its own weight, resistance, and pulse beneath the casing.</p>
      <div class="loading" id="loading" aria-live="polite">
        <div class="loading__row"><span id="loading-label">Preparing field</span><span id="loading-value">0%</span></div>
        <div class="loading__track"><span id="loading-bar"></span></div>
      </div>
      <button class="enter-button" id="enter" disabled>
        <span>${started ? 'Return to field' : 'Enter the field'}</span><span aria-hidden="true">↗</span>
      </button>
      <div class="controls-card">
        <div><kbd>WASD</kbd><span>Walk</span></div>
        <div><kbd>Mouse</kbd><span>Look</span></div>
        <div><kbd>Hold</kbd><span>Touch / stroke</span></div>
        <div><kbd>Esc</kbd><span>Pause</span></div>
      </div>
      <details class="settings">
        <summary>Field settings</summary>
        <div class="settings__grid">
          <label>Quality
            <select id="quality">
              <option value="auto">Automatic</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </label>
          <label>Field of view <output id="fov-value"></output><input id="fov" type="range" min="55" max="85" step="1"></label>
          <label>Look sensitivity <output id="sensitivity-value"></output><input id="sensitivity" type="range" min="0.25" max="1.5" step="0.05"></label>
          <label class="toggle"><input id="sound" type="checkbox"><span>Organic sound</span></label>
          <label class="toggle"><input id="invert" type="checkbox"><span>Invert Y</span></label>
          <label class="toggle"><input id="reduced" type="checkbox"><span>Reduced motion</span></label>
        </div>
      </details>
      <p class="technical">Desktop WebGL2 · Headphones recommended</p>
      <p class="error" id="error" role="alert"></p>
    </div>
  </section>
  <div class="reticle" id="reticle" aria-hidden="true"><span></span></div>
  <div class="touch-label" id="touch-label" aria-hidden="true">hold to make contact</div>
  <div class="stats ${debug ? '' : 'is-hidden'}" id="stats"></div>
`;

const entry = document.querySelector<HTMLElement>('#entry')!;
const enterButton = document.querySelector<HTMLButtonElement>('#enter')!;
const loading = document.querySelector<HTMLElement>('#loading')!;
const loadingLabel = document.querySelector<HTMLElement>('#loading-label')!;
const loadingValue = document.querySelector<HTMLElement>('#loading-value')!;
const loadingBar = document.querySelector<HTMLElement>('#loading-bar')!;
const error = document.querySelector<HTMLElement>('#error')!;
const reticle = document.querySelector<HTMLElement>('#reticle')!;
const touchLabel = document.querySelector<HTMLElement>('#touch-label')!;
const stats = document.querySelector<HTMLElement>('#stats')!;
const quality = document.querySelector<HTMLSelectElement>('#quality')!;
const sound = document.querySelector<HTMLInputElement>('#sound')!;
const invert = document.querySelector<HTMLInputElement>('#invert')!;
const reduced = document.querySelector<HTMLInputElement>('#reduced')!;
const fov = document.querySelector<HTMLInputElement>('#fov')!;
const fovValue = document.querySelector<HTMLOutputElement>('#fov-value')!;
const sensitivity = document.querySelector<HTMLInputElement>('#sensitivity')!;
const sensitivityValue = document.querySelector<HTMLOutputElement>('#sensitivity-value')!;

function syncControls(): void {
  quality.value = settings.quality;
  sound.checked = settings.sound;
  invert.checked = settings.invertY;
  reduced.checked = settings.reducedMotion;
  fov.value = String(settings.fov);
  fovValue.value = `${settings.fov}°`;
  sensitivity.value = String(settings.sensitivity);
  sensitivityValue.value = settings.sensitivity.toFixed(2);
}

function saveSettings(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  field?.setSettings(settings);
}

function updateSettings(): void {
  settings = {
    quality: quality.value as QualityName | 'auto',
    sound: sound.checked,
    invertY: invert.checked,
    reducedMotion: reduced.checked,
    fov: Number(fov.value),
    sensitivity: Number(sensitivity.value),
  };
  fovValue.value = `${settings.fov}°`;
  sensitivityValue.value = settings.sensitivity.toFixed(2);
  saveSettings();
}

for (const element of [quality, sound, invert, reduced, fov, sensitivity]) {
  element.addEventListener('input', updateSettings);
}
syncControls();

enterButton.addEventListener('click', async () => {
  if (!ready || !field) return;
  started = true;
  enterButton.querySelector('span')!.textContent = 'Return to field';
  entry.classList.add('is-leaving');
  await field.enter();
  setTimeout(() => entry.classList.add('is-hidden'), 650);
});

function showCompatibility(message: string): void {
  loading.classList.add('is-hidden');
  enterButton.classList.add('is-hidden');
  error.textContent = message;
  entry.classList.add('is-unsupported');
}

const touchOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
if (touchOnly) {
  showCompatibility('This first version is a desktop field study. Open it on a computer with a mouse and WebGL2 support.');
} else {
  try {
    field = new FieldApp(canvas, settings, {
      onProgress(progress, label) {
        const percent = Math.round(progress * 100);
        loadingLabel.textContent = label;
        loadingValue.textContent = `${percent}%`;
        loadingBar.style.width = `${percent}%`;
        if (progress >= 1) {
          ready = true;
          enterButton.disabled = false;
          loading.classList.add('is-complete');
        }
      },
      onLockChange(locked) {
        if (locked) {
          entry.classList.add('is-hidden');
          entry.classList.remove('is-leaving');
          reticle.classList.add('is-visible');
        } else if (started) {
          entry.classList.remove('is-hidden', 'is-leaving');
          reticle.classList.remove('is-visible', 'can-touch', 'is-touching');
          touchLabel.classList.remove('is-visible');
        }
      },
      onTouchChange(canTouch, touching) {
        reticle.classList.toggle('can-touch', canTouch);
        reticle.classList.toggle('is-touching', touching);
        touchLabel.classList.toggle('is-visible', canTouch && !touching);
      },
      onStats(fps, activeRods, visible) {
        stats.textContent = `${fps} fps · ${activeRods} awake · ${visible} visible`;
      },
      onError(message) {
        error.textContent = message;
        entry.classList.remove('is-hidden', 'is-leaving');
      },
    }, querySeed);
    await field.initialize();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'The field could not be initialized.';
    showCompatibility(message);
  }
}
