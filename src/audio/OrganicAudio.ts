export class OrganicAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private wind?: GainNode;
  private windSource?: AudioBufferSourceNode;
  private enabled = true;
  private lastContact = 0;

  async start(): Promise<void> {
    if (!this.context) this.createGraph();
    await this.context?.resume();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master) this.master.gain.setTargetAtTime(enabled ? 0.46 : 0, this.context?.currentTime ?? 0, 0.08);
  }

  setMovement(speed: number): void {
    if (!this.context || !this.wind) return;
    this.wind.gain.setTargetAtTime(this.enabled ? 0.018 + Math.min(speed, 4) * 0.006 : 0, this.context.currentTime, 0.2);
  }

  contact(pressure: number, firmness: number, wetness: number): void {
    if (!this.enabled || !this.context || !this.master) return;
    const now = this.context.currentTime;
    if (now - this.lastContact < 0.055) return;
    this.lastContact = now;
    const duration = 0.11 + wetness * 0.1;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer(duration);
    const lowpass = this.context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 280 + firmness * 740;
    lowpass.Q.value = 3 + wetness * 5;
    const resonator = this.context.createBiquadFilter();
    resonator.type = 'bandpass';
    resonator.frequency.value = 105 + firmness * 170;
    resonator.Q.value = 5;
    const gain = this.context.createGain();
    const level = Math.min(0.18, 0.025 + pressure * 0.12);
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(lowpass).connect(resonator).connect(gain).connect(this.master);
    source.start(now);
    source.stop(now + duration);
  }

  suspend(): void {
    void this.context?.suspend();
  }

  private createGraph(): void {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = this.enabled ? 0.46 : 0;
    this.master.connect(this.context.destination);
    const windFilter = this.context.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 520;
    this.wind = this.context.createGain();
    this.wind.gain.value = 0.018;
    this.windSource = this.context.createBufferSource();
    this.windSource.buffer = this.noiseBuffer(4);
    this.windSource.loop = true;
    this.windSource.connect(windFilter).connect(this.wind).connect(this.master);
    this.windSource.start();
  }

  private noiseBuffer(duration: number): AudioBuffer {
    if (!this.context) throw new Error('Audio context unavailable');
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.72 + white * 0.28;
      data[i] = previous;
    }
    return buffer;
  }
}
