// app/lib/NormieAmbient3d.ts
// NormieAmbient3d — Generative Web Audio + 3D spatial output + meter for visuals
// - No UI, no DOM
// - You provide pixels + traits (already fetched in page.tsx)
// - Exposes getLevel01() (0..1) to drive starfield
// - ✅ Adds setIntensity(0..1) to make output + meter more/less aggressive
//
// ✅ LINT CLEAN:
// - no `any`
// - no unused `reverbMix` (we now use Expression to gently shape the delay filter / feedback)

export type Trait = { trait_type: string; value: unknown };
export type TraitsResponse = { attributes?: Trait[] };

type Vec3 = { x: number; y: number; z: number };

type WindowWithWebkitAudioContext = Window & {
  webkitAudioContext?: typeof AudioContext;
};

type AudioListenerCompat = AudioListener &
  Partial<{
    positionX: AudioParam;
    positionY: AudioParam;
    positionZ: AudioParam;
    forwardX: AudioParam;
    forwardY: AudioParam;
    forwardZ: AudioParam;
    upX: AudioParam;
    upY: AudioParam;
    upZ: AudioParam;
    setPosition: (x: number, y: number, z: number) => void;
    setOrientation: (
      fx: number,
      fy: number,
      fz: number,
      ux: number,
      uy: number,
      uz: number
    ) => void;
  }>;

// ─────────────────────────────────────────────
// Seeded RNG
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────
// Mappings
const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  wholetone: [0, 2, 4, 6, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

const TYPE_CONFIG: Record<string, { scale: string; baseNote: number }> = {
  Human: { scale: "major", baseNote: 60 },
  Cat: { scale: "pentatonic", baseNote: 62 },
  Alien: { scale: "wholetone", baseNote: 58 },
  Agent: { scale: "minor", baseNote: 57 },
};

const AGE_CONFIG: Record<string, { tempoMult: number; octaveShift: number }> = {
  Young: { tempoMult: 1.2, octaveShift: 1 },
  "Middle-Aged": { tempoMult: 1.0, octaveShift: 0 },
  Old: { tempoMult: 0.7, octaveShift: -1 },
};

// We use Expression to shape "space" (filter cutoff + slight feedback bias).
const EXPRESSION_SPACE: Record<string, number> = {
  Neutral: 0.35,
  "Slight Smile": 0.45,
  Serious: 0.25,
  Happy: 0.55,
  Surprised: 0.4,
  Angry: 0.2,
  Sad: 0.65,
};

const GENDER_RANGE: Record<string, { low: number; high: number }> = {
  Male: { low: -12, high: 5 },
  Female: { low: -2, high: 10 },
  "Non-Binary": { low: -6, high: 8 },
};

const HAIR_PATTERNS: Record<string, number[]> = {
  "Short Hair": [0, 2, 4, 6],
  "Long Hair": [0, 1, 3, 5, 7],
  "Curly Hair": [0, 3, 1, 4, 2, 5],
  "Straight Hair": [0, 2, 4, 2],
  "Spiky Hair": [0, 4, 1, 5, 2],
  Bald: [0, 7],
  "Buzz Cut": [0, 2],
  Mohawk: [0, 6, 1, 7],
  Ponytail: [0, 1, 2, 3, 4, 5, 6],
  Pigtails: [0, 4, 2, 6, 0, 5],
  Afro: [0, 2, 4, 6, 3, 5, 7],
  Bob: [0, 3, 5, 3],
  Braids: [0, 1, 3, 1, 5, 3],
  Dreadlocks: [0, 2, 5, 2, 7, 5],
  "Side Part": [0, 2, 5, 7],
  Bangs: [0, 1, 0, 3, 0, 5],
  "Messy Hair": [0, 5, 2, 7, 1, 6, 3],
  "Slicked Back": [0, 4, 7, 4],
  Undercut: [0, 3, 6, 3],
  "Wavy Hair": [0, 1, 3, 2, 4, 3, 5],
  "Top Knot": [0, 5, 3, 7],
};
const DEFAULT_PATTERN = [0, 2, 4, 6];

const EYES_DELAY: Record<string, number> = {
  "Classic Shades": 0.4,
  "Big Shades": 0.55,
  "Small Shades": 0.3,
  "Round Glasses": 0.5,
  "Square Glasses": 0.35,
  Monocle: 0.6,
  "Eye Patch": 0.2,
  "Narrow Eyes": 0.15,
  "Wide Eyes": 0.45,
  Wink: 0.25,
  "Closed Eyes": 0.65,
  "Glowing Eyes": 0.7,
  "Laser Eyes": 0.1,
  Crying: 0.55,
};

const FACE_HARMONICS: Record<string, { harmonics: number; brightness: number }> =
  {
    "Full Beard": { harmonics: 5, brightness: 0.3 },
    Mustache: { harmonics: 4, brightness: 0.5 },
    Goatee: { harmonics: 3, brightness: 0.6 },
    Stubble: { harmonics: 3, brightness: 0.4 },
    "Shadow Beard": { harmonics: 4, brightness: 0.35 },
    "Clean Shaven": { harmonics: 2, brightness: 0.8 },
    Sideburns: { harmonics: 4, brightness: 0.45 },
    Scar: { harmonics: 6, brightness: 0.2 },
    Mole: { harmonics: 2, brightness: 0.7 },
    Freckles: { harmonics: 3, brightness: 0.75 },
    Dimples: { harmonics: 2, brightness: 0.85 },
    Wrinkles: { harmonics: 5, brightness: 0.25 },
    Tattoo: { harmonics: 6, brightness: 0.4 },
    Birthmark: { harmonics: 3, brightness: 0.6 },
    Piercing: { harmonics: 4, brightness: 0.55 },
    Blush: { harmonics: 2, brightness: 0.9 },
    "Cleft Chin": { harmonics: 3, brightness: 0.5 },
  };
const DEFAULT_HARMONICS = { harmonics: 3, brightness: 0.5 };

// ─────────────────────────────────────────────
// Audio state
let ctx: AudioContext | null = null;

let master: GainNode | null = null;
let outBus: GainNode | null = null;
let panner: PannerNode | null = null;

let delayNode: DelayNode | null = null;
let delayFeedback: GainNode | null = null;
let delayFilter: BiquadFilterNode | null = null;

// Meter (analyser)
let analyser: AnalyserNode | null = null;
let meterBuf: Uint8Array | null = null;
let meterSmoothed = 0;

// Playback
let isPlaying = false;
let schedulerId: number | null = null;
let nextNoteTime = 0;
let seqStep = 0;
let rng: (() => number) | null = null;

let pixelData: string | null = null;
let tokenId = 0;
let traits: Trait[] = [];

// Derived params
let scale = SCALES.major;
let baseNote = 60;
let tempoMs = 400;
let octaveShift = 0;

let genderRange = { low: -6, high: 8 };
let arpPattern = DEFAULT_PATTERN;
let delayAmount = 0.3;
let harmonicConfig = DEFAULT_HARMONICS;
let expressionSpace = 0.35; // 0..1

// global intensity 0..1 (user knob)
let intensity01 = 0.65;

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function midiToFreq(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function colDensity(col: number) {
  if (!pixelData) return 0;
  let c = 0;
  for (let y = 0; y < 40; y++) c += pixelData[y * 40 + col] === "1" ? 1 : 0;
  return c / 40;
}

function getScaleNote(degree: number) {
  const oct = Math.floor(degree / scale.length);
  const idx = ((degree % scale.length) + scale.length) % scale.length;
  return baseNote + scale[idx] + oct * 12 + octaveShift * 12;
}

function makeDailySeed(id: number) {
  const d = new Date();
  const dateSeed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return dateSeed * 10000 + id;
}

function ensureAudio() {
  if (ctx) return;

  const W = window as WindowWithWebkitAudioContext;
  const AC = window.AudioContext ?? W.webkitAudioContext;
  ctx = new AC();

  master = ctx.createGain();
  master.gain.value = 0.85;

  outBus = ctx.createGain();
  outBus.gain.value = 1;

  panner = ctx.createPanner();
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  // tuned for loudness vs zoom
  panner.refDistance = 3;
  panner.maxDistance = 200;
  panner.rolloffFactor = 0.6;

  // out → panner → master → speakers
  outBus.connect(panner);
  panner.connect(master);
  master.connect(ctx.destination);

  // Delay FX (feedback loop)
  delayNode = ctx.createDelay(1.0);
  delayNode.delayTime.value = 0.35;

  delayFeedback = ctx.createGain();
  delayFeedback.gain.value = delayAmount;

  delayFilter = ctx.createBiquadFilter();
  delayFilter.type = "lowpass";
  delayFilter.frequency.value = 2000;

  delayNode.connect(delayFilter);
  delayFilter.connect(delayFeedback);
  delayFeedback.connect(delayNode);

  // route wet delay back into audible chain
  delayNode.connect(outBus);

  // Meter tap (parallel, does not change sound)
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.85;

  meterBuf = new Uint8Array(analyser.fftSize);

  // Tap BEFORE panner so visuals don't depend on camera distance
  outBus.connect(analyser);
}

async function resumeIfNeeded() {
  ensureAudio();
  if (!ctx) return;
  if (ctx.state === "suspended") await ctx.resume();
}

function applyTraits(attrs: Trait[]) {
  let type = "Human";
  let age = "Middle-Aged";
  let expression = "Neutral";
  let gender = "Non-Binary";
  let hair = "";
  let eyes = "";
  let face = "";

  for (const a of attrs) {
    if (a.trait_type === "Type") type = String(a.value);
    if (a.trait_type === "Age") age = String(a.value);
    if (a.trait_type === "Expression") expression = String(a.value);
    if (a.trait_type === "Gender") gender = String(a.value);
    if (a.trait_type === "Hair Style") hair = String(a.value);
    if (a.trait_type === "Eyes") eyes = String(a.value);
    if (a.trait_type === "Facial Feature") face = String(a.value);
  }

  const tc = TYPE_CONFIG[type] || TYPE_CONFIG.Human;
  const ac = AGE_CONFIG[age] || AGE_CONFIG["Middle-Aged"];

  scale = SCALES[tc.scale] || SCALES.major;
  baseNote = tc.baseNote ?? 60;

  // tempo influenced by age, then subtly by intensity (higher intensity = a bit tighter)
  tempoMs = Math.round(400 / (ac.tempoMult ?? 1));
  tempoMs = Math.round(lerp(tempoMs * 1.08, tempoMs * 0.92, intensity01));

  octaveShift = ac.octaveShift ?? 0;

  genderRange = GENDER_RANGE[gender] || GENDER_RANGE["Non-Binary"];
  arpPattern = HAIR_PATTERNS[hair] || DEFAULT_PATTERN;

  delayAmount = EYES_DELAY[eyes] ?? 0.3;
  harmonicConfig = FACE_HARMONICS[face] || DEFAULT_HARMONICS;

  expressionSpace = EXPRESSION_SPACE[expression] ?? 0.35;

  // Apply delay params
  if (delayFeedback) {
    // tiny bias from expression (more "space" => a touch more feedback)
    const fb = clamp01(delayAmount * lerp(0.9, 1.15, expressionSpace));
    delayFeedback.gain.value = fb;
  }
  if (delayNode) delayNode.delayTime.value = 0.2 + delayAmount * 0.4;

  // Use expression to shape the delay filter (more "space" => darker tail)
  if (delayFilter) {
    delayFilter.frequency.value = lerp(2600, 1200, clamp01(expressionSpace));
  }
}

function playTone(freq: number, time: number, dur: number, vel: number, type: OscillatorType) {
  if (!ctx || !outBus) return;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, time);
  g.gain.linearRampToValueAtTime(vel * 0.15, time + 0.04);
  g.gain.exponentialRampToValueAtTime(0.001, time + dur);

  // Dry
  g.connect(outBus);
  // Wet
  if (delayNode) g.connect(delayNode);

  const numH = harmonicConfig.harmonics;
  const bright = harmonicConfig.brightness;

  for (let h = 1; h <= numH; h++) {
    const osc = ctx.createOscillator();
    osc.type = h === 1 ? type : "sine";
    osc.frequency.setValueAtTime(freq * h, time);

    const hg = ctx.createGain();
    hg.gain.value = Math.pow(bright, h - 1) / h;

    osc.connect(hg);
    hg.connect(g);

    osc.start(time);
    osc.stop(time + dur);
  }
}

function playPad(freq: number, time: number, dur: number, vel: number) {
  if (!ctx || !outBus) return;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, time);
  g.gain.linearRampToValueAtTime(vel * 0.06, time + dur * 0.3);
  g.gain.linearRampToValueAtTime(vel * 0.04, time + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.001, time + dur);

  g.connect(outBus);
  if (delayNode) g.connect(delayNode);

  (["sine", "triangle"] as OscillatorType[]).forEach((t, i) => {
    const osc = ctx!.createOscillator();
    osc.type = t;
    osc.frequency.setValueAtTime(freq * (1 + i * 0.002), time);
    osc.connect(g);
    osc.start(time);
    osc.stop(time + dur);
  });
}

function scheduleNotes() {
  if (!ctx || !rng || !isPlaying) return;

  const densityBoost = lerp(0.85, 1.25, intensity01);
  const velBoost = lerp(0.85, 1.35, intensity01);

  while (nextNoteTime < ctx.currentTime + 1.2) {
    const col = seqStep % 40;
    const density = pixelData ? colDensity(col) : 0;
    const r = rng();

    const arpIdx = seqStep % arpPattern.length;
    const arpDeg = arpPattern[arpIdx];

    // Melody
    if (density > 0.05 && r < (0.6 + density * 0.3) * densityBoost) {
      const rangeDeg = genderRange.low + density * (genderRange.high - genderRange.low);
      const degree = Math.floor(rangeDeg) + arpDeg;
      const midi = getScaleNote(degree);
      const f = midiToFreq(midi);
      const dur = (tempoMs / 1000) * (1.5 + rng() * 2);
      const vel = (0.2 + density * 0.5) * velBoost;
      playTone(f, nextNoteTime, dur, vel, "sine");
    }

    // Secondary voice
    if (density > 0.2 && r < 0.25 * densityBoost) {
      const degree = arpDeg + Math.floor(density * 6) + 5;
      const midi = getScaleNote(degree);
      const f = midiToFreq(midi);
      const dur = (tempoMs / 1000) * (2 + rng() * 3);
      playTone(f, nextNoteTime + 0.1, dur, 0.12 * velBoost, "triangle");
    }

    // Pad
    if (seqStep % 8 === 0) {
      const padRoot = getScaleNote(Math.floor(rng() * 4) + genderRange.low);
      const padDur = (tempoMs / 1000) * 8;
      playPad(midiToFreq(padRoot), nextNoteTime, padDur, (0.4 + density * 0.3) * velBoost);
      playPad(midiToFreq(getScaleNote(2 + arpDeg)), nextNoteTime, padDur, 0.2 * velBoost);
    }

    // Bass
    if (seqStep % 4 === 0) {
      const bassDeg = Math.floor(rng() * 3) + genderRange.low;
      const bassMidi = getScaleNote(bassDeg) - 12;
      const bassDur = (tempoMs / 1000) * 4;
      playTone(midiToFreq(bassMidi), nextNoteTime, bassDur, 0.15 * velBoost, "sine");
    }

    nextNoteTime += tempoMs / 1000;
    seqStep++;
  }

  schedulerId = window.setTimeout(scheduleNotes, 100);
}

// ─────────────────────────────────────────────
// Meter helpers (RMS from time domain)
function rmsFromTimeDomain(data: Uint8Array) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / data.length);
}

function smooth(prev: number, next: number, a: number) {
  return prev * a + next * (1 - a);
}

// ─────────────────────────────────────────────
// Public engine
export const NormieAmbient3d = {
  async prime() {
    await resumeIfNeeded();
  },

  setData(args: { id: number; pixels: string | null; traits: TraitsResponse | null }) {
    tokenId = args.id;
    pixelData = args.pixels;
    traits = args.traits?.attributes ?? [];
    applyTraits(traits);
    rng = mulberry32(makeDailySeed(tokenId));
  },

  async start() {
    if (isPlaying) return;
    await resumeIfNeeded();

    if (!ctx) return;
    if (!pixelData) return;

    isPlaying = true;
    nextNoteTime = ctx.currentTime + 0.1;
    seqStep = 0;

    if (!rng) rng = mulberry32(makeDailySeed(tokenId));
    scheduleNotes();
  },

  stop() {
    isPlaying = false;
    if (schedulerId !== null) {
      window.clearTimeout(schedulerId);
      schedulerId = null;
    }
    meterSmoothed = 0;
  },

  isPlaying() {
    return isPlaying;
  },

  setVolume(v01: number) {
    if (!master) return;
    master.gain.value = clamp01(v01);
  },

  setIntensity(v01: number) {
    intensity01 = clamp01(v01);
    applyTraits(traits);
  },

  setSourcePosition(pos: Vec3) {
    if (!ctx || !panner) return;
    const t = ctx.currentTime;
    panner.positionX.setValueAtTime(pos.x, t);
    panner.positionY.setValueAtTime(pos.y, t);
    panner.positionZ.setValueAtTime(pos.z, t);
  },

  setListenerPosition(pos: Vec3) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const L = ctx.listener as AudioListenerCompat;

    if (L.positionX && L.positionY && L.positionZ) {
      L.positionX.setValueAtTime(pos.x, t);
      L.positionY.setValueAtTime(pos.y, t);
      L.positionZ.setValueAtTime(pos.z, t);
      return;
    }

    if (typeof L.setPosition === "function") {
      L.setPosition(pos.x, pos.y, pos.z);
    }
  },

  setListenerOrientation(forward: Vec3, up: Vec3) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const L = ctx.listener as AudioListenerCompat;

    if (
      L.forwardX &&
      L.forwardY &&
      L.forwardZ &&
      L.upX &&
      L.upY &&
      L.upZ
    ) {
      L.forwardX.setValueAtTime(forward.x, t);
      L.forwardY.setValueAtTime(forward.y, t);
      L.forwardZ.setValueAtTime(forward.z, t);
      L.upX.setValueAtTime(up.x, t);
      L.upY.setValueAtTime(up.y, t);
      L.upZ.setValueAtTime(up.z, t);
      return;
    }

    if (typeof L.setOrientation === "function") {
      L.setOrientation(
        forward.x,
        forward.y,
        forward.z,
        up.x,
        up.y,
        up.z
      );
    }
  },

  // Returns a smoothed 0..1 "energy" value based on the audio output (pre-panner).
  getLevel01() {
    if (!isPlaying || !analyser || !meterBuf) return 0;

    // TS lib quirk: some DOM typings require Uint8Array<ArrayBuffer> here.
    const buf = meterBuf as unknown as Uint8Array<ArrayBuffer>;
    analyser.getByteTimeDomainData(buf);

    const raw = rmsFromTimeDomain(meterBuf);

    const NOISE_FLOOR = lerp(0.02, 0.012, intensity01);
    const GAIN = lerp(1.9, 3.2, intensity01);
    const SMOOTHING = lerp(0.94, 0.86, intensity01);

    const boosted = Math.max(0, raw - NOISE_FLOOR) * GAIN;
    const target = clamp01(boosted);

    meterSmoothed = smooth(meterSmoothed, target, SMOOTHING);
    return meterSmoothed;
  },

  dispose() {
    NormieAmbient3d.stop();
  },
};