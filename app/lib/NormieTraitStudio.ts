// app/lib/NormieTraitStudio.ts
// Trait-driven "studio" interpreter.
// Output: visual presets + audio-reactivity shaping.
// Keep this pure (no DOM / no WebAudio).

export type Trait = { trait_type: string; value: unknown };
export type TraitsResponse = { attributes?: Trait[] };

export type StudioParams = {
  // Visual
  lightPreset: number; // 0..4
  materialMode: 0 | 1 | 2 | 3 | 4;
  noiseScale: number; // 2..16
  baseStarfield: number; // 0..1 (how far pixels spread)
  autoRotate: boolean;
  autoRotateSpeed: number;

  // Audio-reactive visuals shaping (INTENSITY influences these further)
  audioStarStrengthBase: number; // baseline strength before intensity shaping
  audioSmoothingBase: number; // baseline smoothing before intensity shaping
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function hashStr(s: string) {
  // small stable hash (deterministic)
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296; // 0..1
}

function getTrait(attrs: Trait[] | undefined, name: string): unknown {
  return attrs?.find((t) => t.trait_type === name)?.value;
}

const TYPE_PRESET: Record<
  string,
  {
    light: number;
    mat: 0 | 1 | 2 | 3 | 4;
    starBase: number;
    noiseBase: number;
    rotSpeed: number;
  }
> = {
  Human: { light: 0, mat: 0, starBase: 0.18, noiseBase: 6, rotSpeed: 0.8 },
  Cat: { light: 1, mat: 4, starBase: 0.28, noiseBase: 7, rotSpeed: 1.05 },
  Alien: { light: 4, mat: 3, starBase: 0.4, noiseBase: 9, rotSpeed: 0.55 },
  Agent: { light: 2, mat: 2, starBase: 0.22, noiseBase: 6, rotSpeed: 0.7 },
};

const EXPRESSION_MOD: Record<
  string,
  {
    star: number;
    noise: number;
    lightBias: number;
    smoothBias: number;
    strengthBias: number;
  }
> = {
  Neutral: { star: 0.0, noise: 0.0, lightBias: 0.0, smoothBias: 0.0, strengthBias: 0.0 },
  "Slight Smile": {
    star: 0.03,
    noise: 0.0,
    lightBias: 0.0,
    smoothBias: -0.02,
    strengthBias: 0.02,
  },
  Serious: {
    star: -0.03,
    noise: -0.5,
    lightBias: 0.0,
    smoothBias: 0.03,
    strengthBias: -0.02,
  },
  Happy: {
    star: 0.05,
    noise: 0.5,
    lightBias: 0.0,
    smoothBias: -0.03,
    strengthBias: 0.05,
  },
  Surprised: {
    star: 0.04,
    noise: 0.7,
    lightBias: 1.0,
    smoothBias: -0.04,
    strengthBias: 0.06,
  },
  Angry: {
    star: -0.02,
    noise: 0.9,
    lightBias: -1.0,
    smoothBias: -0.02,
    strengthBias: 0.08,
  },
  Sad: {
    star: 0.08,
    noise: -0.3,
    lightBias: 0.0,
    smoothBias: 0.05,
    strengthBias: -0.03,
  },
};

const EYES_SPACE: Record<string, number> = {
  "Narrow Eyes": 0.15,
  "Small Shades": 0.2,
  "Eye Patch": 0.22,
  "Classic Shades": 0.3,
  "Square Glasses": 0.32,
  "Round Glasses": 0.35,
  Wink: 0.38,
  "Wide Eyes": 0.45,
  Monocle: 0.48,
  Crying: 0.52,
  "Big Shades": 0.55,
  "Closed Eyes": 0.65,
  "Glowing Eyes": 0.72,
  "Laser Eyes": 0.62,
};

const AGE_ENERGY: Record<string, number> = {
  Young: 0.85,
  "Middle-Aged": 0.55,
  Old: 0.25,
};

export function deriveStudioParams(traits: TraitsResponse | null): StudioParams {
  const attrs = traits?.attributes ?? [];

  const type = String(getTrait(attrs, "Type") ?? "Human");
  const expr = String(getTrait(attrs, "Expression") ?? "Neutral");
  const eyes = String(getTrait(attrs, "Eyes") ?? "");
  const age = String(getTrait(attrs, "Age") ?? "Middle-Aged");
  const hair = String(getTrait(attrs, "Hair Style") ?? "");
  const face = String(getTrait(attrs, "Facial Feature") ?? "");
  const gender = String(getTrait(attrs, "Gender") ?? "Non-Binary");

  const base = TYPE_PRESET[type] ?? TYPE_PRESET.Human;
  const em = EXPRESSION_MOD[expr] ?? EXPRESSION_MOD.Neutral;

  // Space (0..1) from eyes, with small contribution from expression "Sad/spacious"
  const space = clamp((EYES_SPACE[eyes] ?? 0.33) + (expr === "Sad" ? 0.06 : 0), 0, 1);

  // Energy (0..1) from age (big)
  const energy = clamp(AGE_ENERGY[age] ?? 0.55, 0, 1);

  // Complexity from hair/face/gender (subtle)
  const hairH = hashStr(hair || "hair");
  const faceH = hashStr(face || "face");
  const genderH = hashStr(gender || "gender");
  const complexity = clamp(0.35 + 0.35 * hairH + 0.2 * faceH + 0.1 * genderH, 0, 1);

  // Visual synthesis
  const baseStarfield = clamp(base.starBase + 0.35 * space + 0.1 * complexity + em.star, 0, 1);

  // noiseScale: trait-driven blob size (2..16)
  const noiseScale = clamp(
    Math.round(base.noiseBase + em.noise + 5 * complexity - 2 * (1 - energy)),
    2,
    16
  );

  // Lighting: type decides, expression can nudge it
  let lightPreset = base.light;
  if (em.lightBias > 0) lightPreset = (lightPreset + 1) % 5;
  if (em.lightBias < 0) lightPreset = (lightPreset + 4) % 5;

  // Material: type decides baseline; face/hair can nudge
  let materialMode = base.mat;
  if (faceH > 0.7) materialMode = ((materialMode + 1) % 5) as 0 | 1 | 2 | 3 | 4;
  if (faceH < 0.25) materialMode = ((materialMode + 4) % 5) as 0 | 1 | 2 | 3 | 4;

  // Rotation: more energy = more rotation baseline (actual rotation is gated by audio in the scene)
  const autoRotate = true;
  const autoRotateSpeed = clamp(base.rotSpeed + 1.0 * (energy - 0.5), 0.15, 2.2);

  // Audio-reactive visual shaping baselines (intensity will further shape these)
  const audioStarStrengthBase = clamp(0.22 + 0.22 * energy + em.strengthBias, 0.12, 0.6);
  const audioSmoothingBase = clamp(0.94 - 0.1 * energy + em.smoothBias, 0.8, 0.97);

  return {
    lightPreset,
    materialMode,
    noiseScale,
    baseStarfield,
    autoRotate,
    autoRotateSpeed,
    audioStarStrengthBase,
    audioSmoothingBase,
  };
}