/* ===========================
   app/components/NormieVoxels.tsx
   8 contiguous NOISE groups (smooth field) + universe sphere starfield
   =========================== */
import { useMemo } from "react";

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

// value noise on a 2D grid + bilinear interpolation
function hash2(ix: number, iy: number, seed: number) {
  // stable hash -> [0,1)
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

export function NormieVoxels({
  pixels,
  pixelSize = 0.08,
  depth = 0.12,
  z, // 8 sliders
  starfield, // 0..1
  seed,
  noiseScale, // NEW: controls group blob size
}: {
  pixels: string;
  pixelSize?: number;
  depth?: number;
  z: number[]; // length 8
  starfield: number;
  seed: number;
  noiseScale: number; // e.g. 2..16
}) {
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

    // Universe radius + shell feel
    const R = 12;
    const shellBias = 0.35;

    // map "noiseScale" -> frequency: higher scale => bigger blobs (lower frequency)
    const freq = 1 / Math.max(1.5, noiseScale);

    for (let i = 0; i < pixels.length; i++) {
      if (pixels[i] !== "1") continue;

      const px = i % W;
      const py = Math.floor(i / W);

      const bx = (px - halfW) * pixelSize;
      const by = (halfH - py) * pixelSize;
      const bz = ((halfH - py) / halfH) * depth * 0.6;

      // tiny jitter to reduce z-fighting lines
      const jitter =
        (xorshift32(((i + 1) * 10007) ^ (seed * 9176)) - 0.5) * pixelSize * 0.003;

      // ✅ contiguous group assignment via smooth noise field
      // use px/py space (not index) -> blobs/regions
      const n = noise2(px * freq, py * freq, seed + 1337); // [0,1)
      const group = Math.min(7, Math.floor(n * 8)); // 0..7

      // Universe target per cube
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

  return (
    <group position={[0, 0.05, 0]}>
      {cubes.map((c, idx) => {
        const zOff = z[c.group] ?? 0;

        // fade Z offsets out as starfield increases
        const zBlend = 1 - starfield;

        const baseZ = c.bz + c.jitter + zOff * zBlend;

        const x = lerp(c.bx, c.tx, starfield);
        const y = lerp(c.by, c.ty, starfield);
        const zPos = lerp(baseZ, c.tz, starfield);

        return (
          <mesh key={idx} position={[x, y, zPos]}>
            <boxGeometry args={[pixelSize, pixelSize, pixelSize]} />
            <meshStandardMaterial
              color={normieColor}
              roughness={0.9}
              metalness={0}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}