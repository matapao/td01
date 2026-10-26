/** Original Web Audio effects and ambience. No recordings are fetched or redistributed. */
import type { Game } from './game.ts';
import { ENEMIES, classOf, daylight } from '../game/content.ts';
import { GATE } from '../game/map.ts';
import { indoors } from '../game/interiors.ts';

type Wave = OscillatorType;

/** Cues share an original recipe when they do not need a distinct sound. */
const FALLBACK: Record<string, string> = {
  draw: 'bow',
  alarm: 'horn',
  buy: 'coin',
  chest: 'gate',
  door: 'place',
  burrow: 'dig',
  lift: 'crash',
  fell: 'crash',
  anvil: 'hammer',
  fireball: 'burn',
  meteor: 'arcane',
  fuse: 'burn',
  throw: 'axe',
  axehit: 'slash',
  block: 'buildinghit',
  raise: 'groan',
  fall: 'hurt',
  slam: 'axe',
  mend: 'learn',
  gears: 'repair',
  steam: 'smelt',
  chuff: 'smelt',
  power: 'zap',
  hum: 'wire',
  relay: 'wire',
  telegraph: 'code',
  radio: 'radar',
  computer: 'code',
  conveyor: 'repair',
  servo: 'wire',
  launch: 'boom',
  rumble: 'gate',
  chatter: 'radar',
  touchdown: 'place',
  rover: 'wire',
  drone: 'wire',
  porter: 'place',
  reforge: 'smelt',
  forged: 'levelup',
};

/** The tower archer's animation timing, in seconds. */
const BOW_REACH = 0.62;
const BOW_CYCLE = 0.62 + (1.33 - 0.47);

/** A Road of Invention milestone's sound when it is invented (the rest: the generic 'gears'). */
const MILESTONE_SOUND: Record<string, string> = {
  bronze: 'anvil',
  steel: 'anvil',
  glass: 'smelt',
  gears: 'gears',
  arch: 'built',
  steam: 'steam',
  rails: 'chuff',
  grid: 'power',
  battery: 'hum',
  searchlight: 'power',
  telegraph: 'telegraph',
  relay: 'relay',
  radio: 'radio',
  radar: 'radar',
  silicon: 'crystal',
  solar: 'hum',
  computer: 'computer',
  feedback: 'servo',
  robots: 'conveyor',
  rocketry: 'rumble',
  payload: 'wire',
  entry: 'rumble',
  rover: 'rover',
  isru: 'steam',
  homeward: 'rumble',
};
const DEVICE_SOUND: Record<string, string> = {
  searchlight: 'power',
  radar: 'radar',
  targeter: 'computer',
  relay: 'relay',
  solar: 'hum',
};

/** Preserve the original synthesized ambience level on the ambience bus. */
const SYNTH_WIND = 0.35 / 0.8;

export class Audio {
  private game: Game;

  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private verb!: ConvolverNode;
  private noiseBuf!: AudioBuffer;
  private last = new Map<string, number>();
  volume = 0.8;
  private windGain: GainNode | null = null;
  private torchGain: GainNode | null = null;
  private windFade: GainNode | null = null;
  private windWant = SYNTH_WIND;
  private ambT = 0;
  private bedT = 0;
  private roverT = -1;
  private roverIceT = -1;

  constructor(game: Game) {
    this.game = game;

    const start = () => this.init();
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    // Some browsers suspend audio (backgrounded tabs, power saving): any input wakes it again.
    const wake = () => {
      if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
    };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    this.hook();
    // For the console and the tests: window.__audio.status(), window.__audio.play('horn').
    (window as unknown as { __audio?: Audio }).__audio = this;
  }

  /** Compatibility diagnostics for the browser checks; recordings are intentionally absent. */
  status(): {
    mode: 'synthesized';
    ready: number;
    failed: string[];
    waiting: number;
    beds: Record<string, string>;
    voices: number;
    state: string;
  } {
    return {
      mode: 'synthesized',
      ready: 0,
      failed: [],
      waiting: 0,
      beds: {},
      voices: 0,
      state: this.ctx?.state ?? 'none',
    };
  }

  private init(): void {
    if (this.ctx) return;
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      return; // no Web Audio here: the game plays on in silence
    }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.gain.value = 0.8;
    this.amb.connect(this.master);
    // Reverb from decaying noise.
    this.verb = ctx.createConvolver();
    const len = ctx.sampleRate * 1.8;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    this.verb.connect(wet).connect(this.master);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.startAmbience();
    this.ambience();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  // ---- Primitives ---------------------------------------------------------------------------------

  private out(gain: number, pan: number, verb = 0.3): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(this.sfx);
    if (verb > 0) {
      const s = ctx.createGain();
      s.gain.value = verb;
      p.connect(s).connect(this.verb);
    }
    return g;
  }

  private tone(
    dest: AudioNode,
    f0: number,
    f1: number,
    dur: number,
    type: Wave = 'sine',
    vol = 0.3,
    attack = 0.005,
    delay = 0,
  ): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(
    dest: AudioNode,
    dur: number,
    filter: BiquadFilterType,
    f0: number,
    f1: number,
    q = 1,
    vol = 0.3,
    attack = 0.003,
    delay = 0,
  ): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const bq = ctx.createBiquadFilter();
    bq.type = filter;
    bq.Q.value = q;
    bq.frequency.setValueAtTime(f0, t);
    bq.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bq).connect(g).connect(dest);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  // ---- Playing ------------------------------------------------------------------------------------

  /** Plays a named sound; with a world position it is panned and attenuated. */
  play(name: string, x?: number, z?: number, vol = 1): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const limit = RATE[name] ?? 0.03;
    const prev = this.last.get(name) ?? -1;
    if (now - prev < limit) return;
    this.last.set(name, now);
    let gain = vol;
    let pan = 0;
    if (x !== undefined && z !== undefined) {
      const cam = this.game.cam;
      const dx = x - cam.target.x;
      const dz = z - cam.target.z;
      const d = Math.hypot(dx, dz);
      const span = cam.dist * 1.1 * (RANGE[name] ?? 1);
      gain *= Math.max(0, 1 - Math.max(0, d - span * 0.4) / (span * 1.2));
      if (gain < 0.03) return;
      const right = dx * Math.cos(cam.yaw) - dz * Math.sin(cam.yaw);
      pan = Math.max(-0.8, Math.min(0.8, right / span));
    }
    this.synth(FALLBACK[name] ?? name, gain, pan);
  }

  /** Generate an original sound with oscillators and noise. Unknown cues stay silent. */
  private synth(name: string, gain: number, pan: number): void {
    if (!RECIPES.has(name)) return;
    const o = this.out(gain, pan, VERB[name] ?? 0.25);
    const T = (f0: number, f1: number, d: number, type: Wave = 'sine', v = 0.3, a = 0.005, delay = 0) =>
      this.tone(o, f0, f1, d, type, v, a, delay);
    const N = (
      d: number,
      f: BiquadFilterType,
      f0: number,
      f1: number,
      q = 1,
      v = 0.3,
      a = 0.003,
      delay = 0,
    ) => this.noise(o, d, f, f0, f1, q, v, a, delay);
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    switch (name) {
      // UI
      case 'click':
        T(1800, 1200, 0.04, 'triangle', 0.08);
        break;
      case 'open':
        T(520, 780, 0.12, 'triangle', 0.1);
        T(780, 1040, 0.12, 'triangle', 0.08, 0.005, 0.06);
        break;
      case 'deny':
        T(180, 140, 0.18, 'square', 0.06);
        break;
      case 'coin':
        T(1900, 1900, 0.09, 'triangle', 0.12);
        T(2530, 2530, 0.14, 'triangle', 0.1, 0.003, 0.05);
        break;
      case 'loot1':
        [784, 988, 1175].forEach((f, i) => T(f, f, 0.25, 'triangle', 0.12, 0.004, i * 0.07));
        break;
      case 'loot2':
        [784, 988, 1175, 1568].forEach((f, i) => T(f, f, 0.3, 'triangle', 0.13, 0.004, i * 0.07));
        break;
      case 'loot3':
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => T(f, f, 0.45, 'sawtooth', 0.06, 0.004, i * 0.06));
        N(0.8, 'highpass', 6000, 9000, 0.5, 0.05, 0.2);
        break;
      case 'scroll':
        N(0.25, 'bandpass', 2400, 1200, 1.5, 0.12);
        break;
      case 'learn':
        [659, 880, 1109, 1319].forEach((f, i) => T(f, f, 0.5, 'sine', 0.1, 0.01, i * 0.09));
        break;
      case 'place':
        T(150, 70, 0.18, 'sine', 0.25);
        N(0.12, 'lowpass', 900, 200, 1, 0.15);
        break;
      case 'built':
        T(120, 60, 0.25, 'sine', 0.3);
        N(0.3, 'lowpass', 1200, 200, 1, 0.2);
        [523, 659, 784, 1047].forEach((f, i) => T(f, f, 0.4, 'triangle', 0.09, 0.005, 0.12 + i * 0.06));
        break;
      case 'addon':
        [659, 988, 1319].forEach((f, i) => T(f, f, 0.45, 'triangle', 0.1, 0.005, i * 0.07));
        N(0.4, 'highpass', 5000, 8000, 0.7, 0.04);
        break;
      // Gathering
      case 'chop':
        N(0.08, 'bandpass', r(900, 1300), 400, 2, 0.4);
        T(r(180, 220), 120, 0.1, 'triangle', 0.25);
        break;
      case 'mine':
        T(r(1900, 2400), r(1700, 2000), 0.12, 'square', 0.06);
        N(0.1, 'highpass', 3000, 2000, 1, 0.2);
        break;
      case 'crystal':
        T(r(2200, 2800), r(2200, 2800), 0.4, 'sine', 0.12);
        T(r(3300, 3900), r(3300, 3900), 0.3, 'sine', 0.06, 0.003, 0.03);
        break;
      case 'scrapdig':
        N(0.15, 'bandpass', 1500, 600, 3, 0.25);
        T(r(400, 600), 300, 0.12, 'square', 0.05);
        break;
      case 'pickup':
        T(r(900, 1100), r(1300, 1500), 0.07, 'triangle', 0.09);
        break;
      // Hands-on work
      case 'hammer':
        T(r(1500, 1700), 1400, 0.25, 'square', 0.08);
        T(r(3000, 3400), 3000, 0.18, 'sine', 0.06);
        N(0.05, 'highpass', 4000, 3000, 1, 0.2);
        break;
      case 'saw':
        N(0.22, 'bandpass', 2600, 1600, 4, 0.3, 0.04);
        break;
      case 'cut':
        T(r(2600, 3000), 2400, 0.08, 'square', 0.07);
        N(0.06, 'highpass', 4000, 3000, 1, 0.25);
        break;
      case 'smelt':
        N(0.45, 'lowpass', 600, 1800, 1, 0.3, 0.08);
        break;
      case 'weld':
        N(0.3, 'highpass', 6000, 9000, 0.7, 0.18, 0.01);
        T(r(90, 110), 100, 0.3, 'sawtooth', 0.03);
        break;
      case 'wire':
        T(r(1200, 1400), r(2400, 2800), 0.12, 'sawtooth', 0.05);
        break;
      case 'code':
        T(r(880, 1100), r(1320, 1650), 0.25, 'sine', 0.1);
        T(r(1760, 2200), r(1760, 2200), 0.25, 'sine', 0.05, 0.01, 0.05);
        break;
      case 'perfect':
        [1319, 1760].forEach((f, i) => T(f, f, 0.22, 'triangle', 0.1, 0.003, i * 0.05));
        break;
      case 'miss':
        T(220, 160, 0.12, 'triangle', 0.07);
        break;
      case 'crafted':
        T(659, 659, 0.15, 'triangle', 0.1);
        T(988, 988, 0.25, 'triangle', 0.1, 0.004, 0.07);
        break;
      // Combat
      case 'bow':
        T(r(380, 440), r(240, 280), 0.12, 'triangle', 0.12);
        N(0.1, 'bandpass', 2400, 900, 2, 0.12);
        break;
      case 'arrowhit':
        N(0.06, 'bandpass', r(700, 1000), 400, 2, 0.25);
        break;
      case 'catapult':
        N(0.25, 'lowpass', 700, 200, 1, 0.3, 0.02);
        T(90, 60, 0.3, 'sine', 0.3);
        break;
      case 'boom':
        T(110, 35, 0.6, 'sine', 0.55);
        N(0.7, 'lowpass', 1600, 120, 0.8, 0.55);
        N(0.2, 'highpass', 2000, 800, 0.7, 0.2);
        break;
      case 'smallboom':
        T(160, 50, 0.3, 'sine', 0.3);
        N(0.3, 'lowpass', 1800, 200, 0.8, 0.3);
        break;
      case 'arcane':
        T(r(600, 700), r(1300, 1500), 0.22, 'sine', 0.12);
        T(r(900, 1000), r(1800, 2000), 0.18, 'triangle', 0.05);
        break;
      case 'arcanehit':
        T(r(1500, 1700), r(700, 800), 0.2, 'sine', 0.1);
        N(0.15, 'highpass', 4000, 6000, 1, 0.08);
        break;
      case 'zap':
        N(0.18, 'bandpass', 3000, 1200, 6, 0.3, 0.002);
        T(r(100, 140), 60, 0.15, 'sawtooth', 0.12);
        break;
      case 'frost':
        T(r(2400, 2800), r(3200, 3600), 0.18, 'triangle', 0.07);
        break;
      case 'freeze':
        N(0.4, 'highpass', 3000, 7000, 2, 0.2);
        T(1800, 2600, 0.3, 'sine', 0.08);
        break;
      case 'shatter':
        N(0.35, 'highpass', 5000, 3000, 1, 0.45);
        [3100, 3700, 4400].forEach((f, i) => T(f, f * 0.9, 0.2, 'triangle', 0.06, 0.002, i * 0.02));
        break;
      case 'burn':
        N(0.5, 'lowpass', 900, 2600, 0.7, 0.18, 0.08);
        break;
      case 'slash':
        N(0.09, 'bandpass', 3200, 1600, 2, 0.25);
        T(r(1100, 1300), 900, 0.1, 'square', 0.04);
        break;
      case 'bones':
        for (let i = 0; i < 5; i++)
          T(r(700, 1600), r(500, 900), 0.06, 'square', 0.035, 0.002, i * r(0.03, 0.06));
        N(0.15, 'bandpass', 1200, 600, 2, 0.1);
        break;
      case 'rise':
        N(0.9, 'lowpass', 200, 600, 1, 0.25, 0.2);
        T(r(70, 90), r(50, 60), 0.8, 'sawtooth', 0.04, 0.2);
        break;
      case 'groan':
        T(r(110, 140), r(80, 100), 0.6, 'sawtooth', 0.05, 0.1);
        break;
      case 'roar':
        T(90, 55, 1.2, 'sawtooth', 0.2, 0.1);
        N(1.2, 'lowpass', 600, 200, 1, 0.3, 0.1);
        break;
      case 'hurt':
        T(r(170, 200), r(120, 140), 0.2, 'sawtooth', 0.09);
        break;
      case 'repulse':
        T(90, 30, 0.6, 'sine', 0.55);
        N(0.5, 'lowpass', 900, 100, 0.8, 0.45);
        break;
      case 'axe':
        N(0.3, 'bandpass', 900, 2400, 2, 0.15, 0.05);
        break;
      case 'cry':
        [262, 330, 392].forEach((f, i) => T(f, f * 1.01, 0.9, 'sawtooth', 0.06, 0.05, i * 0.02));
        break;
      case 'levelup':
        [523, 659, 784, 1047, 1319].forEach((f, i) => T(f, f, 0.5, 'triangle', 0.1, 0.005, i * 0.08));
        break;
      case 'buildinghit':
        N(0.2, 'lowpass', 900, 300, 1, 0.35);
        T(r(140, 180), 90, 0.15, 'triangle', 0.15);
        break;
      case 'crash':
        N(1.0, 'lowpass', 1500, 100, 0.7, 0.6);
        T(80, 30, 0.9, 'sine', 0.4);
        break;
      case 'repair':
        T(r(1200, 1400), 1100, 0.15, 'square', 0.05);
        break;
      case 'dig':
        N(0.4, 'lowpass', 300, 120, 1, 0.25, 0.05);
        break;
      case 'radar':
        T(1320, 1320, 0.5, 'sine', 0.08, 0.01);
        T(1980, 1980, 0.4, 'sine', 0.03, 0.01, 0.02);
        break;
      // Events
      case 'horn':
        [147, 147.8, 220].forEach((f) => T(f, f * 0.98, 1.6, 'sawtooth', 0.07, 0.15));
        N(1.4, 'lowpass', 600, 300, 0.5, 0.06, 0.2);
        break;
      case 'cleared':
        [392, 523, 659, 784].forEach((f, i) => T(f, f, 0.6, 'triangle', 0.1, 0.01, i * 0.11));
        break;
      case 'leak':
        T(110, 70, 0.5, 'square', 0.12);
        T(220, 140, 0.4, 'sawtooth', 0.05, 0.005, 0.12);
        break;
      case 'gate':
        N(1.2, 'bandpass', 300, 120, 6, 0.2, 0.2);
        T(70, 60, 1.1, 'sawtooth', 0.05, 0.2);
        break;
      case 'discover':
        [880, 1175, 1568].forEach((f, i) => T(f, f, 0.6, 'sine', 0.09, 0.02, i * 0.12));
        break;
      case 'victory':
        [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) =>
          T(f, f, 0.6, 'triangle', 0.12, 0.01, i * 0.16),
        );
        break;
      case 'defeat':
        [392, 349, 311, 262].forEach((f, i) => T(f, f * 0.98, 0.9, 'sawtooth', 0.06, 0.05, i * 0.3));
        break;
    }
  }

  // ---- Ambience -----------------------------------------------------------------------------------

  /** Generate a quiet wind bed without loading an audio file. */
  private startAmbience(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bq = ctx.createBiquadFilter();
    bq.type = 'lowpass';
    bq.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0.12;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lg = ctx.createGain();
    lg.gain.value = 0.06;
    lfo.connect(lg).connect(g.gain);
    const fade = ctx.createGain();
    fade.gain.value = SYNTH_WIND;
    src.connect(bq).connect(g).connect(fade).connect(this.amb);
    const fireFilter = ctx.createBiquadFilter();
    fireFilter.type = 'lowpass';
    fireFilter.frequency.value = 1600;
    this.torchGain = ctx.createGain();
    this.torchGain.gain.value = 0;
    src.connect(fireFilter).connect(this.torchGain).connect(this.amb);
    src.start();
    lfo.start();
    this.windGain = g;
    this.windFade = fade;
  }

  /** Generated fire follows the same purchased, lit mine-torch conditions as its light. */
  private bedWeights(): { torch?: number } {
    const game = this.game;
    if (!game.under || game.inSpace || game.indoors) return {};
    const hero = game.sim.getAs(game.localHero, 'hero');
    return hero && !hero.dead && !hero.droneOn && hero.torchOwned && hero.torchLit !== false
      ? { torch: 1 }
      : {};
  }

  /** Fade generated wind out below ground and in Space. */
  private ambience(): void {
    const now = this.ctx!.currentTime;
    const g = this.game;
    const synth = g.under || g.inSpace ? 0 : SYNTH_WIND;
    this.torchGain?.gain.setTargetAtTime((this.bedWeights().torch ?? 0) * 0.035, now, 0.15);
    if (this.windFade && synth !== this.windWant) {
      this.windFade.gain.setTargetAtTime(synth, now, 1.5);
      this.windWant = synth;
    }
    const gust = g.sim.state.enemies.some((e) => !e.camp) ? 0.07 : 0.12;
    if (this.windGain && this.windGain.gain.value !== gust) this.windGain.gain.value = gust;
  }

  /** The base in Space at work: the rover's round, heard near its module. */
  private spaceWork(): void {
    const sp = this.game.sim.state.space;
    if (!sp) return;
    const rover = sp.workT['rover'] ?? 0;
    const ice = sp.workT['roverIce'] ?? 0;
    const back =
      (this.roverT >= 0 && rover < this.roverT - 1) || (this.roverIceT >= 0 && ice < this.roverIceT - 1);
    this.roverT = rover;
    this.roverIceT = ice;
    if (!back || !this.game.inSpace) return;
    const m = sp.modules.find((mm) => mm.kind === 'rover');
    if (m) this.play('rover', m.x, m.z, 0.8);
  }

  update(dt: number): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.bedT -= dt;
    if (this.bedT <= 0) {
      this.bedT = 0.25;
      this.ambience();
      this.spaceWork();
    }
    this.ambT -= dt;
    if (this.ambT > 0) return;
    this.ambT = 0.8 + Math.random() * 2.5;
    // Original synthesized birdsong and crickets.
    const g = this.game;
    if (g.under || g.inSpace) return;
    const s = g.sim.state;
    if (s.enemies.some((e) => !e.camp)) return;
    const night = daylight(g.tod) < 0.5;
    const o = this.ctx.createGain();
    o.gain.value = 0.5 * SYNTH_WIND;
    o.connect(this.amb);
    if (night) {
      for (let i = 0; i < 3; i++) this.tone(o, 4200, 4100, 0.05, 'sine', 0.04, 0.002, i * 0.07);
    } else {
      const f = 2200 + Math.random() * 1600;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++)
        this.tone(o, f, f * (1.15 + Math.random() * 0.2), 0.09, 'sine', 0.05, 0.005, i * 0.12);
    }
  }

  // ---- Game events → sounds ------------------------------------------------------------------------

  private hook(): void {
    const sim = this.game.sim;
    const ev = sim.events;
    const p = (name: string, x?: number, z?: number, v = 1) => this.play(name, x, z, v);
    // Down the mine: the mountain's creaks (see Game.unease).
    this.game.onUnease = (kind, x, z) =>
      p(
        kind === 'grit' ? 'dig' : kind === 'rumble' ? 'rumble' : 'groan',
        x,
        z,
        kind === 'rumble' ? 0.3 : kind === 'grit' ? 0.4 : 0.35,
      );
    const later = (ms: number, name: string, x?: number, z?: number, v = 1) =>
      setTimeout(() => p(name, x, z, v), ms);
    ev.on('gatherHit', (e) =>
      p(e.kind === 'tree' ? 'chop' : e.kind === 'crystal' ? 'crystal' : 'mine', e.x, e.z),
    );
    // The wall's gate: its doors swinging (or bursting) open and shut, the dead battering it, its mending.
    ev.on('gateMoved', (e) => p(e.broken ? 'crash' : 'gate', GATE.x, GATE.z));
    ev.on('gateHit', () => p('block', GATE.x, GATE.z));
    ev.on('gateRepaired', () => p('hammer', GATE.x - 2, GATE.z));
    ev.on('nodeDepleted', (e) => {
      if (e.kind !== 'tree') return;
      const n = sim.getAs(e.node, 'node');
      if (n) p('fell', n.x, n.z, 0.8);
    });
    // Down the mine: ore coming down off a blasted face, rubble clearing, a wagon rolling off and stopping.
    ev.on('earthHit', (e) => p('mine', e.x, e.z));
    ev.on('digHit', (e) => p(e.mineral ? 'mine' : 'dig', e.x, e.z));
    ev.on('cellDug', (e) => !e.blasted && p('dig', e.x, e.z));
    ev.on('caveInCleared', (e) => later(350, 'crash', e.x, e.z, 0.9));
    ev.on('rideStart', (e) => p('lift', e.x, e.z, 0.45));
    ev.on('rideEnd', (e) => p('place', e.x, e.z, 0.6));
    ev.on('bombLit', (e) => p('fuse', e.x, e.z, 0.6));
    ev.on('blast', (e) => p('boom', e.x, e.z, 1.4));
    ev.on('rideLift', () => p('lift', undefined, undefined, 0.6));
    ev.on('pickedUp', (e) => {
      if (e.item === 'gold') p('coin', e.x, e.z, 0.8);
      else if (e.inst) p(`loot${e.inst.rarity}`);
      else p('pickup', e.x, e.z, 0.6);
    });
    ev.on('dropSpawned', (e) => {
      if (e.inst) p(`loot${e.inst.rarity}`, e.x, e.z, 0.7);
    });
    /** Where work at a building sounds: the building — or, when the hero works it inside its room, the hero. */
    const workAt = (
      hero: number,
      x?: number,
      z?: number,
    ): { x: number | undefined; z: number | undefined } => {
      const h = sim.getAs(hero, 'hero');
      return h && indoors(h.x) ? { x: h.x, z: h.z } : { x, z };
    };
    ev.on('workBeat', (e) => {
      const ent = sim.get(e.target);
      const pos = ent && 'x' in ent.e ? (ent.e as { x: number; z: number }) : undefined;
      if (e.quality === 0) p('miss');
      else {
        // Forging the gears at the anvil rings the anvil.
        const anvil = e.action === 'hammer' && ent?.type === 'building' && ent.e.kind === 'anvil';
        const w = workAt(e.hero, pos?.x, pos?.z);
        p(anvil ? 'anvil' : e.action, w.x, w.z);
        if (e.quality === 2) p('perfect');
      }
    });
    // Reforging a weapon at the anvil: into the fire with a roar and a hiss; off the anvil with a
    // last strike, a bright ring — and the hero's cheer.
    ev.on('reforgeStarted', (e) => {
      const b = sim.getAs(e.station, 'building');
      const w = workAt(e.hero, b?.x, b?.z);
      p('reforge', w.x, w.z);
    });
    ev.on('reforged', (e) => {
      const w = workAt(e.hero, e.x, e.z);
      p('anvil', w.x, w.z);
      later(220, 'forged', w.x, w.z);
      later(750, 'cry', w.x, w.z, 0.55);
    });
    ev.on('crafted', () => p('crafted'));
    ev.on('sitePlaced', (e) => p('place', e.x, e.z));
    ev.on('buildingDone', (e) => p('built', e.x, e.z));
    ev.on('topBuilt', (e) => p('built', e.x, e.z));
    ev.on('demolished', (e) => p('crash', e.x, e.z, 0.7));
    ev.on('gemSet', () => p('addon'));
    ev.on('delivered', () => p('place', undefined, undefined, 0.5));
    ev.on('learned', () => p('learn'));
    ev.on('scrollFound', () => p('scroll'));
    ev.on('studyStarted', () => p('scroll'));
    const mine = (e: { hero?: number }) => e.hero === undefined || e.hero === this.game.localHero;
    ev.on('bought', (e) => mine(e) && p('buy'));
    ev.on('boughtOut', (e) => {
      if (mine(e)) p('buy');
      // The porters set the load down at the plan (and wave).
      later(450, 'porter', e.x, e.z);
    });
    ev.on('sold', () => p('coin'));
    ev.on('denied', (e) => mine(e) && p('deny'));
    ev.on('shopOpen', (e) => mine(e) && p('open'));
    ev.on('storageOpen', (e) => mine(e) && p('open'));
    ev.on('entered', (e) => mine(e) && p('door', undefined, undefined, 0.8));
    ev.on('chestOpened', (e) => {
      p('chest', e.x, e.z);
      later(250, 'loot2', e.x, e.z);
    });
    // The tower archer looses (the string's snap), then reaches back, nocks and draws again: the draw
    // creaks when he pulls — timed like his animation (entities.ts BOW), which fits the draw between shots.
    const shots = new Map<number, { last: number; gap: number }>();
    ev.on('towerFired', (e) => {
      const b = sim.getAs(e.building, 'building');
      if (!b) return;
      p(e.kind === 'bolt' ? 'bow' : e.kind === 'boulder' ? 'catapult' : 'arcane', b.x, b.z, 0.8);
      if ((e.kind !== 'bolt' && e.kind !== 'arcane') || e.shooter > 0) return;
      const now = performance.now() / 1000;
      const s = shots.get(b.id) ?? { last: -1, gap: 0 };
      const gap = s.last >= 0 ? Math.min(2.5, now - s.last) : 1.6;
      s.gap = s.gap ? s.gap * 0.6 + gap * 0.4 : gap;
      s.last = now;
      shots.set(b.id, s);
      const speed = Math.min(3.2, Math.max(1, BOW_CYCLE / (0.85 * s.gap)));
      later((BOW_REACH / speed) * 1000, 'draw', b.x, b.z, 0.7);
    });
    ev.on('projHit', (e) => {
      if (e.kind === 'bolt') p('arrowhit', e.x, e.z, 0.6);
      else if (e.kind === 'arcane') p('arcanehit', e.x, e.z, 0.7);
      else if (e.kind === 'axe') p('axehit', e.x, e.z);
    });
    ev.on('explosion', (e) => p(e.kind === 'bomblet' ? 'smallboom' : 'boom', e.x, e.z));
    ev.on('chainArc', (e) => p('zap', e.tx, e.tz, 0.7));
    ev.on('status', (e) =>
      p(
        e.kind === 'freeze'
          ? 'freeze'
          : e.kind === 'shatter'
            ? 'shatter'
            : e.kind === 'burn'
              ? 'burn'
              : 'frost',
        e.x,
        e.z,
        0.8,
      ),
    );
    ev.on('unitAttack', (e) => {
      const u = sim.getAs(e.id, 'unit');
      if (u) p('slash', u.x, u.z, 0.6);
    });
    ev.on('heroAttack', (e) => {
      const h = sim.getAs(e.hero, 'hero');
      if (!h) return;
      // The Mage's bolt; a swing.
      p(classOf(h).ranged ? 'arcane' : 'slash', h.x, h.z, classOf(h).ranged ? 0.7 : 1);
    });
    ev.on('heroHit', (e) => {
      const h = sim.getAs(e.hero, 'hero');
      // The Knight takes it on his shield.
      const name = h && classOf(h).id === 'tank' ? 'block' : 'hurt';
      if (!h || e.hero === this.game.localHero) p(name);
      else p(name, h.x, h.z);
    });
    ev.on('heroDied', (e) => {
      const h = sim.getAs(e.hero, 'hero');
      if (h) p('fall', h.x, h.z);
    });
    ev.on('heroLevel', () => p('levelup'));
    const CAST_SOUND = {
      slam: 'slam',
      cry: 'cry',
      wall: 'block',
      mend: 'mend',
      rally: 'horn',
      repulse: 'repulse',
      drone: 'drone',
      fireball: 'fireball',
      nova: 'freeze',
      meteor: 'meteor',
    } as const;
    ev.on('heroCast', (e) => p(CAST_SOUND[e.ability], e.x, e.z));
    ev.on('droneLaunched', (e) => p('drone', e.x, e.z));
    ev.on('enemySpawned', (e) => {
      const en = sim.getAs(e.id, 'enemy');
      if (!en || en.camp) return;
      if (ENEMIES[e.kind].boss) p('roar');
      else p('rise', en.x, en.z, 0.6);
    });
    ev.on('enemyDied', (e) => p('bones', e.x, e.z, 0.8));
    ev.on('enemyAbility', (e) => {
      if (e.ability === 'stomp') p('boom', e.x, e.z);
      else if (e.ability === 'enrage') p('roar', e.x, e.z);
      else if (e.ability === 'summon') p('groan', e.x, e.z);
      else if (e.ability === 'raise') p('raise', e.x, e.z);
    });
    ev.on('buildingHit', (e) => {
      const b = sim.getAs(e.building, 'building');
      if (b) p('buildinghit', b.x, b.z);
    });
    ev.on('buildingDestroyed', (e) => p('crash', e.x, e.z));
    ev.on('repaired', (e) => {
      const b = sim.getAs(e.building, 'building');
      if (b) p('repair', b.x, b.z, 0.5);
    });
    ev.on('burrowed', (e) => {
      const en = sim.getAs(e.id, 'enemy');
      if (en) p('burrow', en.x, en.z);
    });
    ev.on('surfaced', (e) => p('burrow', e.x, e.z));
    ev.on('radarPulse', (e) => p('radar', e.x, e.z, 0.6));
    ev.on('waveStarted', () => {
      p('horn');
      later(400, 'gate');
    });
    ev.on('waveCleared', () => p('cleared'));
    ev.on('campCleared', () => p('cleared', undefined, undefined, 0.6));
    ev.on('laneOpened', () => later(1200, 'gate', undefined, undefined, 0.8));
    ev.on('livesLost', () => {
      p('leak');
      p('alarm', undefined, undefined, 0.8);
    });
    ev.on('storeDiscovered', () => p('discover'));
    ev.on('gameOver', (e) => p(e.won ? 'victory' : 'defeat'));
    // The Road of Invention: each milestone sounds of its age; the grid and the towers' devices.
    ev.on('invented', (e) => {
      if (!mine(e)) return;
      if (e.quality <= 0) {
        p('miss');
        return;
      }
      p(MILESTONE_SOUND[e.milestone] ?? 'gears');
      later(500, 'learn', undefined, undefined, 0.8);
    });
    ev.on('powerOn', (e) => p('power', e.x, e.z));
    ev.on('deviceSet', (e) => p(DEVICE_SOUND[e.device] ?? 'wire', e.x, e.z));
    ev.on('devicesRemoved', (e) => p('wire', e.x, e.z));
    // Space: lift-off at the Port (or the ascent vehicle at the base), each phase of a flight where you are, the landing.
    ev.on('launched', (e) => p('launch', e.x, e.z));
    ev.on('flightPhase', (e) => {
      // Outbound flights rise from the vale and come down in Space; homeward ones the other way round.
      const atVale = e.phase === 'ascent' ? !e.home : e.home;
      if (atVale === this.game.inSpace) return;
      if (e.phase === 'ascent') later(2500, 'rumble', undefined, undefined, 0.6);
      else if (e.phase === 'entry' || e.phase === 'braking' || e.phase === 'descent')
        p('rumble', undefined, undefined, 0.55);
      else if (e.phase === 'parachute') p('open');
      else if (e.phase === 'touchdown') p('touchdown');
    });
    ev.on('landed', (e) => {
      if (e.home === this.game.inSpace) return;
      p('touchdown', e.x, e.z);
      later(700, 'chatter', undefined, undefined, 0.7);
    });
  }
}

/** Minimum seconds between plays of the same sound. */
const RATE: Record<string, number> = {
  bow: 0.05,
  arrowhit: 0.05,
  slash: 0.06,
  bones: 0.05,
  rise: 0.15,
  coin: 0.05,
  pickup: 0.04,
  chop: 0.05,
  mine: 0.05,
  zap: 0.05,
  frost: 0.08,
  burn: 0.2,
  boom: 0.08,
  repair: 0.12,
  hurt: 0.15,
  buildinghit: 0.1,
  deny: 0.25,
  place: 0.06,
  dig: 0.3,
  radar: 0.5,
  buy: 0.08,
  open: 0.1,
  chest: 0.3,
  door: 0.4,
  burrow: 0.3,
  lift: 0.8,
  fell: 0.5,
  anvil: 0.06,
  throw: 0.08,
  axehit: 0.05,
  block: 0.1,
  fall: 0.5,
  fuse: 0.3,
  fireball: 0.2,
  meteor: 0.3,
  raise: 0.3,
  mend: 0.3,
  slam: 0.2,
  alarm: 1.5,
  cleared: 0.5,
  gears: 0.4,
  steam: 0.4,
  chuff: 0.4,
  power: 0.3,
  hum: 0.4,
  relay: 0.15,
  telegraph: 0.3,
  radio: 0.5,
  computer: 0.3,
  conveyor: 0.5,
  servo: 0.2,
  launch: 2,
  rumble: 1,
  chatter: 2,
  touchdown: 0.5,
  rover: 1,
  drone: 0.5,
  roar: 0.4,
  horn: 0.5,
  draw: 0.08,
  porter: 0.2,
  reforge: 0.5,
  forged: 0.5,
};

const VERB: Record<string, number> = {
  boom: 0.4,
  horn: 0.6,
  roar: 0.5,
  crash: 0.5,
  cleared: 0.5,
  levelup: 0.5,
  victory: 0.5,
  defeat: 0.6,
  gate: 0.4,
  loot3: 0.6,
  learn: 0.5,
  alarm: 0.5,
  launch: 0.3,
  fell: 0.4,
  anvil: 0.35,
};

/** How far a sound carries (× the usual span). */
const RANGE: Record<string, number> = {
  launch: 4,
  boom: 1.4,
  crash: 1.3,
  fell: 1.4,
  roar: 1.5,
  alarm: 2,
  rover: 1.5,
};

/** The sounds that have a synthesised recipe (see Audio.synth). */
const RECIPES = new Set([
  'click',
  'open',
  'deny',
  'coin',
  'loot1',
  'loot2',
  'loot3',
  'scroll',
  'learn',
  'place',
  'built',
  'addon',
  'chop',
  'mine',
  'crystal',
  'scrapdig',
  'pickup',
  'hammer',
  'saw',
  'cut',
  'smelt',
  'weld',
  'wire',
  'code',
  'perfect',
  'miss',
  'crafted',
  'bow',
  'arrowhit',
  'catapult',
  'boom',
  'smallboom',
  'arcane',
  'arcanehit',
  'zap',
  'frost',
  'freeze',
  'shatter',
  'burn',
  'slash',
  'bones',
  'rise',
  'groan',
  'roar',
  'hurt',
  'repulse',
  'axe',
  'cry',
  'levelup',
  'buildinghit',
  'crash',
  'repair',
  'dig',
  'radar',
  'horn',
  'cleared',
  'leak',
  'gate',
  'discover',
  'victory',
  'defeat',
]);
