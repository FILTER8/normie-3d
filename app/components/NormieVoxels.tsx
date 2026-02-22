/* ===========================
   app/components/NormieVoxels.tsx
   + MATERIAL modes
   + per-group extrude in INTEGER voxel blocks
   =========================== */
import { useMemo } from "react";
import * as THREE from "three";

export type MaterialMode = 0 | 1 | 2 | 3 | 4;
// 0 Matte, 1 Glossy, 2 Chrome, 3 Emissive, 4 Pastel-By-Group

function xorshift32(seed: number) {
  let x = seed | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 4294967296; // [0,1)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function randomUnitVec(i: number, seed: number) {
  const s0 = (i + 1) * 2654435761;
  const u = xorshift32((s0 ^ (seed * 1013)) | 0);
  const v = xorshift32((s0 ^ (seed * 2027) ^ 0x9e3779b9) | 0);

  const theta = 2 * Math.PI * u;
  const z = 2 * v - 1;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return { x: r * Math.cos(theta), y: r * Math.sin(theta), z };
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

function hash2(ix: number, iy: number, seed: number) {
  const n = (ix * 374761393) ^ (iy * 668265263) ^ (seed * 1442695041);
  return xorshift32(n | 0);
}

function noise2(x: number, y: number, seed: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const sx = smoothstep(x - x0);
  const sy = smoothstep(y - y0);

  const n00 = hash2(x0, y0, seed);
  const n10 = hash2(x1, y0, seed);
  const n01 = hash2(x0, y1, seed);
  const n11 = hash2(x1, y1, seed);

  const ix0 = lerp(n00, n10, sx);
  const ix1 = lerp(n01, n11, sx);
  return lerp(ix0, ix1, sy); // [0,1)
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function hueToHex(h: number, s: number, l: number) {
  // HSL -> hex (small helper)
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c);
  };
  const r = f(0);
  const g = f(8);
  const b = f(4);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const DEFAULT_EXTRUDE = Array.from({ length: 8 }, () => 1);

export function NormieVoxels({
  pixels,
  pixelSize = 0.08,
  depth = 0.12,
  z,
  extrude,
  starfield,
  seed,
  noiseScale,
  materialMode,
}: {
  pixels: string;
  pixelSize?: number;
  depth?: number;
  z: number[]; // length 8
  extrude?: number[]; // length 8, ints (>=1)
  starfield: number;
  seed: number;
  noiseScale: number; // 2..16
  materialMode: MaterialMode;
}) {
  const exArr = extrude ?? DEFAULT_EXTRUDE;

  const cubes = useMemo(() => {
    const out: {
      bx: number;
      by: number;
      bz: number;
      tx: number;
      ty: number;
      tz: number;
      group: number; // 0..7
      jitter: number;
    }[] = [];

    const W = 40,
      H = 40;
    const halfW = (W - 1) / 2;
    const halfH = (H - 1) / 2;

    const R = 12;
    const shellBias = 0.35;

    const freq = 1 / Math.max(1.5, noiseScale);

    for (let i = 0; i < pixels.length; i++) {
      if (pixels[i] !== "1") continue;

      const px = i % W;
      const py = Math.floor(i / W);

      const bx = (px - halfW) * pixelSize;
      const by = (halfH - py) * pixelSize;
      const bz = ((halfH - py) / halfH) * depth * 0.6;

      const jitter =
        (xorshift32(((i + 1) * 10007) ^ (seed * 9176)) - 0.5) *
        pixelSize *
        0.003;

      const n = noise2(px * freq, py * freq, seed + 1337);
      const group = Math.min(7, Math.floor(n * 8));

      const dir = randomUnitVec(i, seed);
      const u = xorshift32(((i + 1) * 1618033) ^ (seed * 3343));
      const rVolume = Math.cbrt(u);
      const rShell = Math.pow(u, 0.12);
      const rMix = rVolume * (1 - shellBias) + rShell * shellBias;
      const radius = rMix * R;

      out.push({
        bx,
        by,
        bz,
        jitter,
        tx: dir.x * radius,
        ty: dir.y * radius,
        tz: dir.z * radius,
        group,
      });
    }

    return out;
  }, [pixels, pixelSize, depth, seed, noiseScale]);

  const normieColor = "#48494b";

  const materials = useMemo(() => {
    // Make shared material(s) so we don't create 1000s of materials
    const mode = materialMode % 5;

    if (mode === 4) {
      // Pastel by group (8 materials)
      const arr: THREE.MeshStandardMaterial[] = [];
      for (let g = 0; g < 8; g++) {
        // stable pastel palette based on seed+group
        const h = (xorshift32((seed + 17) * 1009 + g * 97) * 0.9 + 0.05) % 1;
        const hex = hueToHex(h, 0.45, 0.78);
        arr.push(
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(hex),
            roughness: 0.85,
            metalness: 0.0,
            toneMapped: false,
          })
        );
      }
      return arr;
    }

    const base = new THREE.MeshStandardMaterial({
      color: new THREE.Color(normieColor),
      roughness: 0.9,
      metalness: 0.0,
      toneMapped: false,
    });

    if (mode === 0) {
      // Matte
      base.roughness = 0.92;
      base.metalness = 0.0;
      return [base];
    }

    if (mode === 1) {
      // Glossy
      base.roughness = 0.18;
      base.metalness = 0.0;
      return [base];
    }

    if (mode === 2) {
      // Chrome-ish
      base.roughness = 0.05;
      base.metalness = 1.0;
      return [base];
    }

    // mode === 3 Emissive
    base.roughness = 0.75;
    base.metalness = 0.0;
    base.emissive = new THREE.Color(normieColor);
    base.emissiveIntensity = 0.55;
    return [base];
  }, [materialMode, seed]);

  return (
    <group position={[0, 0.05, 0]}>
      {cubes.map((c, i) => {
        const zOff = z[c.group] ?? 0;

        // integer "block count" extrude, minimum 1
        const rawBlocks = Math.round(exArr[c.group] ?? 1);
        const blocks = clamp(rawBlocks, 1, 16); // allow more extreme
        // blend back to 1 as starfield increases
        const blocksBlend = lerp(blocks, 1, starfield);

        const thick = pixelSize * blocksBlend;

        // fade Z offsets out as starfield increases
        const zBlend = 1 - starfield;
        const baseZ = c.bz + c.jitter + zOff * zBlend;

        const x = lerp(c.bx, c.tx, starfield);
        const y = lerp(c.by, c.ty, starfield);

        // shift so extra thickness grows outward a bit (relief feel)
        const zPos = lerp(baseZ + (thick - pixelSize) * 0.5, c.tz, starfield);

        const mat =
          (materialMode % 5) === 4
            ? materials[c.group] ?? materials[0]
            : materials[0];

        return (
          <mesh key={i} position={[x, y, zPos]} material={mat}>
            <boxGeometry args={[pixelSize, pixelSize, thick]} />
          </mesh>
        );
      })}
    </group>
  );
}