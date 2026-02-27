export type GraveAudio = {
  ensureStarted: () => void;
  setEnabled: (on: boolean) => void;
  setIntensity: (n: number) => void;

  playCircle: (x: number, y: number, size?: number) => void;
  playOpen: () => void;
  setScale: (name: "minorPent" | "majorPent" | "dorian" | "lydian") => void;

  dispose: () => void;
};

type WebkitAudioContextCtor = new () => AudioContext;
type WindowWithWebkitAudioContext = Window & { webkitAudioContext?: WebkitAudioContextCtor };

export function createGraveAudio(): GraveAudio {
  let ctx: AudioContext | null = null;
  let enabled = false;

  // master
  let master!: GainNode;
  let limiter!: DynamicsCompressorNode;

  // global tone shaping
  let toneLP!: BiquadFilterNode;
  let toneHP!: BiquadFilterNode;

  // space: delay + verb
  let delay!: DelayNode;
  let feedback!: GainNode;
  let delayWet!: GainNode;
  let fbLP!: BiquadFilterNode;

  let convolver!: ConvolverNode;
  let verbWet!: GainNode;
  let verbSend!: GainNode;

  // subtle “movement”: modulate delay time very slightly (chorus-ish)
  let delayLFO!: OscillatorNode;
  let delayLFODepth!: GainNode;

  // intensity state 0..1
  let intensity = 0.85;

  // --- PAD SYSTEM: 5 scenes that crossfade ---
  type PadVoice = {
    o1: OscillatorNode;
    o2: OscillatorNode;
    o3: OscillatorNode;
    o4: OscillatorNode;
    g: GainNode;
    lp: BiquadFilterNode;
    driftLFO: OscillatorNode;
    driftDepth: GainNode;
  };
  let pads: PadVoice[] = [];
  let padMaster!: GainNode;
  let padIndex = 0;
  let nextPadAt = 0;
  let padCrossfadingUntil = 0;

  // pad breathing (amplitude + filter)
  let breathLFO!: OscillatorNode;
  let breathDepth!: GainNode;
  let breathFilterDepth!: GainNode;

  // --- OPEN BLOOM (sub + air) ---
  let openSub!: OscillatorNode;
  let openGain!: GainNode;
  let openLP!: BiquadFilterNode;

  // --- AUTOPILOT ---
  let autoTimer: number | null = null;
  let nextAutoAt = 0;

  // tonal system
  type ScaleName = "minorPent" | "majorPent" | "dorian" | "lydian";
  const SCALES: Record<ScaleName, number[]> = {
    minorPent: [0, 3, 5, 7, 10],
    majorPent: [0, 2, 4, 7, 9],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
  };
  let scaleName: ScaleName = "minorPent";

  // calm root (const to satisfy prefer-const)
  const rootHz = 110; // A2

  // 5 pad “chord colors” (ratios relative to rootHz)
  const PAD_SCENES: Array<[number, number, number, number]> = [
    [1, 3 / 2, 2, 9 / 8], // sus/add2 shimmer
    [1, 4 / 3, 2, 5 / 3], // sus4 + 6 (dreamy)
    [1, 5 / 4, 2, 9 / 8], // major warmth + add2
    [1, 6 / 5, 2, 3 / 2], // minor warmth + fifth
    [1, 3 / 2, 2, 7 / 4], // soft “blue” color (subtle)
  ];

  const now = () => (ctx ? ctx.currentTime : 0);
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  const hzFromSemis = (base: number, semis: number) => base * Math.pow(2, semis / 12);

  // longer IR => longer perceived reverb tail
  const makeImpulse = (ac: AudioContext, seconds = 10.5, decay = 5.6) => {
    const sr = ac.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = ac.createBuffer(2, len, sr);

    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const x = i / len;
        const n = (Math.random() * 2 - 1) * (0.85 + 0.15 * Math.random());
        data[i] = n * Math.pow(1 - x, decay);
      }
    }
    return buf;
  };

  const makeNoiseBuffer = (ac: AudioContext, seconds = 0.8, level = 0.18) => {
    const sr = ac.sampleRate;
    const buf = ac.createBuffer(1, Math.floor(sr * seconds), sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * level;
    return buf;
  };

  const quantize = (targetHz: number) => {
    const scale = SCALES[scaleName];
    const candidates: number[] = [];
    for (let oct = -2; oct <= 4; oct++) {
      for (const s of scale) candidates.push(hzFromSemis(rootHz, s + 12 * oct));
    }
    let best = candidates[0];
    let bestErr = Math.abs(best - targetHz);
    for (let i = 1; i < candidates.length; i++) {
      const err = Math.abs(candidates[i] - targetHz);
      if (err < bestErr) {
        bestErr = err;
        best = candidates[i];
      }
    }
    return best;
  };

  const crossfadePadTo = (idx: number, seconds = 10) => {
    if (!ctx) return;
    const t = now();

    pads.forEach((p, i) => {
      p.g.gain.cancelScheduledValues(t);
      p.g.gain.setValueAtTime(p.g.gain.value, t);
      p.g.gain.linearRampToValueAtTime(i === idx ? 1.0 : 0.0, t + seconds);
    });

    padIndex = idx;
    padCrossfadingUntil = t + seconds;
  };

  const startAuto = () => {
    if (autoTimer != null) return;
    nextAutoAt = now() + 1.5 + Math.random() * 3.0;

    autoTimer = window.setInterval(() => {
      if (!ctx || !enabled) return;
      const t = now();

      // PAD FLOW
      if (t >= nextPadAt && t >= padCrossfadingUntil) {
        const hop = 1 + ((Math.random() * 2) | 0); // 1 or 2
        const next = (padIndex + hop) % pads.length;
        const dur = 12 + Math.random() * 12; // 12..24s crossfade
        crossfadePadTo(next, dur);
        nextPadAt = t + (16 + Math.random() * 22); // next change in ~16..38s
      }

      // AUTOBLOOM (~1 hit per 6s avg)
      if (t < nextAutoAt) return;

      const x = Math.random();
      const y = Math.random();
      const size = 0.22 + Math.random() * 0.55;
      playCircle(x, y, size);

      // occasional cluster (gentle)
      if (Math.random() < 0.18) {
        const x2 = Math.min(1, Math.max(0, x + (Math.random() * 0.24 - 0.12)));
        const y2 = Math.min(1, Math.max(0, y + (Math.random() * 0.24 - 0.12)));
        playCircle(x2, y2, size * (0.55 + Math.random() * 0.30));
      }

      // rare “open bloom”
      if (Math.random() < 0.09) playOpen();

      // average ~6s: uniform 3..9 (mean 6)
      nextAutoAt = t + (3.0 + Math.random() * 6.0);
    }, 250);
  };

  const stopAuto = () => {
    if (autoTimer != null) {
      window.clearInterval(autoTimer);
      autoTimer = null;
    }
  };

  const start = () => {
    if (ctx) return;

    const w = window as WindowWithWebkitAudioContext;
    const Ctor = window.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) throw new Error("WebAudio not supported in this browser.");

    ctx = new Ctor();

    // --- MASTER CHAIN ---
    master = ctx.createGain();
    master.gain.value = 0;

    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.knee.value = 20;
    limiter.ratio.value = 7;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;

    master.connect(limiter);
    limiter.connect(ctx.destination);

    // global EQ-ish
    toneHP = ctx.createBiquadFilter();
    toneHP.type = "highpass";
    toneHP.frequency.value = 40;
    toneHP.Q.value = 0.6;

    toneLP = ctx.createBiquadFilter();
    toneLP.type = "lowpass";
    toneLP.frequency.value = 1500;
    toneLP.Q.value = 0.65;

    toneHP.connect(toneLP);
    toneLP.connect(master);

    // --- DELAY (LOOOOONG) ---
    // Longer delay time + higher feedback (still < 1).
    // Add a lowpass filter inside the feedback loop to keep the repeats soft.
    delay = ctx.createDelay(2.0);
    delay.delayTime.value = 1.35; // long

    fbLP = ctx.createBiquadFilter();
    fbLP.type = "lowpass";
    fbLP.frequency.value = 1300;
    fbLP.Q.value = 0.5;

    feedback = ctx.createGain();
    feedback.gain.value = 0.68; // long repeats baseline (safe)

    delayWet = ctx.createGain();
    delayWet.gain.value = 0.26;

    // routing:
    // toneLP -> delay -> delayWet -> master
    // delay -> fbLP -> feedback -> delay
    toneLP.connect(delay);
    delay.connect(delayWet);
    delayWet.connect(master);

    delay.connect(fbLP);
    fbLP.connect(feedback);
    feedback.connect(delay);

    // subtle delay modulation (tiny)
    delayLFO = ctx.createOscillator();
    delayLFO.type = "sine";
    delayLFO.frequency.value = 0.018; // slower

    delayLFODepth = ctx.createGain();
    delayLFODepth.gain.value = 0.004; // seconds (tiny)

    delayLFO.connect(delayLFODepth);
    delayLFODepth.connect(delay.delayTime);

    // --- REVERB (LONGER TAIL) ---
    convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx, 10.5, 5.6);

    verbWet = ctx.createGain();
    verbWet.gain.value = 0.18;

    verbSend = ctx.createGain();
    verbSend.gain.value = 0.26;

    toneLP.connect(verbSend);
    verbSend.connect(convolver);
    convolver.connect(verbWet);
    verbWet.connect(master);

    // --- PAD MASTER ---
    padMaster = ctx.createGain();
    padMaster.gain.value = 0.0;
    padMaster.connect(toneHP);

    // breathing LFO controls pad master gain + pad filter subtly
    breathLFO = ctx.createOscillator();
    breathLFO.type = "sine";
    breathLFO.frequency.value = 0.010; // ~100s

    breathDepth = ctx.createGain();
    breathDepth.gain.value = 0.014;

    breathFilterDepth = ctx.createGain();
    breathFilterDepth.gain.value = 260;

    breathLFO.connect(breathDepth);
    breathDepth.connect(padMaster.gain);

    // --- BUILD 5 PAD SCENES ---
    const makePad = (ratios: [number, number, number, number]): PadVoice => {
      const g = ctx!.createGain();
      g.gain.value = 0.0;
      g.connect(padMaster);

      const lp = ctx!.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      lp.Q.value = 0.6;
      lp.connect(g);

      const o1 = ctx!.createOscillator();
      const o2 = ctx!.createOscillator();
      const o3 = ctx!.createOscillator();
      const o4 = ctx!.createOscillator();

      o1.type = "sine";
      o2.type = "sine";
      o3.type = "triangle";
      o4.type = "sine";

      o1.frequency.value = rootHz * ratios[0];
      o2.frequency.value = rootHz * ratios[1];
      o3.frequency.value = rootHz * ratios[2];
      o4.frequency.value = rootHz * ratios[3];

      const g1 = ctx!.createGain();
      const g2 = ctx!.createGain();
      const g3 = ctx!.createGain();
      const g4 = ctx!.createGain();

      g1.gain.value = 0.08;
      g2.gain.value = 0.055;
      g3.gain.value = 0.040;
      g4.gain.value = 0.035;

      // micro drift
      const driftLFO = ctx!.createOscillator();
      driftLFO.type = "sine";
      driftLFO.frequency.value = 0.018 + Math.random() * 0.018;

      const driftDepth = ctx!.createGain();
      driftDepth.gain.value = 4 + Math.random() * 5; // cents

      driftLFO.connect(driftDepth);
      driftDepth.connect(o2.detune);
      driftDepth.connect(o4.detune);

      o1.connect(g1);
      o2.connect(g2);
      o3.connect(g3);
      o4.connect(g4);

      g1.connect(lp);
      g2.connect(lp);
      g3.connect(lp);
      g4.connect(lp);

      // breathing filter modulation
      const lf = ctx!.createGain();
      lf.gain.value = 1.0;
      breathLFO.connect(lf);
      lf.connect(breathFilterDepth);
      breathFilterDepth.connect(lp.frequency);

      o1.start();
      o2.start();
      o3.start();
      o4.start();
      driftLFO.start();

      return { o1, o2, o3, o4, g, lp, driftLFO, driftDepth };
    };

    pads = PAD_SCENES.map((r) => makePad(r));

    pads[0].g.gain.value = 1.0;
    padIndex = 0;

    // --- OPEN BLOOM (sub + air) ---
    openSub = ctx.createOscillator();
    openSub.type = "sine";
    openSub.frequency.value = rootHz / 2;

    openGain = ctx.createGain();
    openGain.gain.value = 0.0;

    openLP = ctx.createBiquadFilter();
    openLP.type = "lowpass";
    openLP.frequency.value = 180;
    openLP.Q.value = 0.75;

    openSub.connect(openGain);
    openGain.connect(openLP);
    openLP.connect(toneHP);

    openSub.start();

    breathLFO.start();
    delayLFO.start();

    const t0 = now();
    nextPadAt = t0 + (10 + Math.random() * 12);
    padCrossfadingUntil = t0;
  };

  const ensureStarted = () => {
    start();
    if (ctx?.state === "suspended") ctx.resume();
  };

  const setEnabled = (on: boolean) => {
    enabled = on;
    if (!ctx) {
      if (on) ensureStarted();
      else return;
    }
    if (!ctx) return;

    const t = now();
    if (enabled) {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.48, t + 1.0);

      padMaster.gain.cancelScheduledValues(t);
      padMaster.gain.setValueAtTime(Math.max(0.0001, padMaster.gain.value), t);
      padMaster.gain.setTargetAtTime(0.10 + intensity * 0.09, t, 1.4);

      startAuto();
    } else {
      stopAuto();

      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0, t + 0.7);

      padMaster.gain.cancelScheduledValues(t);
      padMaster.gain.setValueAtTime(padMaster.gain.value, t);
      padMaster.gain.setTargetAtTime(0.0, t, 0.7);
    }
  };

  const setIntensity = (n: number) => {
    if (!ctx) return;
    const t = now();
    intensity = clamp01(n / 20);

    // global tone opens with intensity
    toneLP.frequency.setTargetAtTime(1050 + intensity * 2400, t, 1.2);
    toneHP.frequency.setTargetAtTime(35 + intensity * 35, t, 1.3);

    // LOOOOONG delay: keep feedback < 1 always
    // baseline already ~0.68, push towards ~0.86 at high intensity (still stable)
    feedback.gain.setTargetAtTime(0.64 + intensity * 0.22, t, 1.4);
    delayWet.gain.setTargetAtTime(0.22 + intensity * 0.20, t, 1.4);

    // soften repeats as intensity rises (prevents bright build-up)
    fbLP.frequency.setTargetAtTime(950 + intensity * 850, t, 1.6);

    // longer verb feel (tail length comes from impulse; these control mix)
    verbWet.gain.setTargetAtTime(0.16 + intensity * 0.22, t, 1.8);
    verbSend.gain.setTargetAtTime(0.20 + intensity * 0.36, t, 1.8);

    // pads
    padMaster.gain.setTargetAtTime(0.10 + intensity * 0.11, t, 1.5);
    breathDepth.gain.setTargetAtTime(0.010 + intensity * 0.018, t, 1.7);

    // tiny chorus depth
    delayLFODepth.gain.setTargetAtTime(0.003 + intensity * 0.005, t, 1.8);
  };

  const setScale = (name: ScaleName) => {
    scaleName = name;
  };

  const playCircle = (x: number, y: number, size = 0.6) => {
    if (!ctx || !enabled) return;
    const t = now();

    const xn = clamp01(x);
    const yn = clamp01(y);
    const sn = clamp01(size);

    const minHz = rootHz * 1.0;
    const maxHz = rootHz * 7.0;
    const intended = minHz * Math.pow(maxHz / minHz, xn);
    const f = quantize(intended);

    const decay = 2.2 + (1 - yn) * 7.8; // slightly longer
    const bright = 700 + yn * 2600;

    const amp = 0.014 + sn * 0.050;

    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const o3 = ctx.createOscillator();

    o1.type = "sine";
    o2.type = "sine";
    o3.type = "triangle";

    o1.frequency.setValueAtTime(f, t);
    o2.frequency.setValueAtTime(f * 2.005, t);
    o3.frequency.setValueAtTime(f * 3.01, t);

    o2.detune.setValueAtTime(Math.random() * 10 - 5, t);
    o3.detune.setValueAtTime(Math.random() * 12 - 6, t);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.050);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);

    const m1 = ctx.createGain();
    const m2 = ctx.createGain();
    const m3 = ctx.createGain();
    m1.gain.value = 1.0;
    m2.gain.value = 0.22;
    m3.gain.value = 0.10;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(bright, t);
    lp.Q.value = 0.85;

    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(xn * 1.6 - 0.8, t);

    const toTone = ctx.createGain();
    toTone.gain.value = 0.92;

    const toDry = ctx.createGain();
    toDry.gain.value = 0.05;

    o1.connect(m1);
    o2.connect(m2);
    o3.connect(m3);
    m1.connect(g);
    m2.connect(g);
    m3.connect(g);

    g.connect(lp);
    lp.connect(pan);

    pan.connect(toTone);
    toTone.connect(toneHP);

    pan.connect(toDry);
    toDry.connect(master);

    o1.start(t);
    o2.start(t);
    o3.start(t);
    o1.stop(t + decay + 0.25);
    o2.stop(t + decay + 0.25);
    o3.stop(t + decay + 0.25);
  };

  const playOpen = () => {
    if (!ctx || !enabled) return;
    const t = now();

    const scale = SCALES[scaleName];
    const deg = scale[(Math.random() * scale.length) | 0];
    let target = hzFromSemis(rootHz, deg) / 2;
    target = Math.max(34, Math.min(78, target));

    openSub.frequency.cancelScheduledValues(t);
    openSub.frequency.setValueAtTime(openSub.frequency.value, t);
    openSub.frequency.setTargetAtTime(target, t, 0.45);
    openSub.frequency.setTargetAtTime(rootHz / 2, t + 2.2, 1.1);

    openGain.gain.cancelScheduledValues(t);
    openGain.gain.setValueAtTime(Math.max(0.0001, openGain.gain.value), t);
    openGain.gain.exponentialRampToValueAtTime(0.09, t + 0.22);
    openGain.gain.exponentialRampToValueAtTime(0.0001, t + 7.4);

    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx, 1.05, 0.18);

    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.045, t + 0.24);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 6.2);

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(520 + intensity * 980, t);
    bp.Q.value = 0.95;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.setValueAtTime(200, t);

    const toTone = ctx.createGain();
    toTone.gain.value = 0.95;

    src.connect(ng);
    ng.connect(bp);
    bp.connect(hp);
    hp.connect(toTone);
    toTone.connect(toneHP);

    src.start(t);
    src.stop(t + 1.06);
  };

  const dispose = () => {
    stopAuto();
    if (!ctx) return;
    try {
      pads.forEach((p) => {
        p.o1.stop();
        p.o2.stop();
        p.o3.stop();
        p.o4.stop();
        p.driftLFO.stop();
      });
      breathLFO?.stop();
      delayLFO?.stop();
      openSub?.stop();
    } catch {}
    ctx.close();
    ctx = null;
  };

  return {
    ensureStarted,
    setEnabled,
    setIntensity,
    playCircle,
    playOpen,
    setScale,
    dispose,
  };
}