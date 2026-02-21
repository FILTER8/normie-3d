import { NextRequest } from "next/server";
import * as THREE from "three";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";

export const runtime = "nodejs";

const API_BASE = "https://api.normies.art";

function clampId(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(9999, n));
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// ===== EXACT helpers from NormieVoxels.tsx =====
function xorshift32(seed: number) {
  let x = seed | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 4294967296;
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
  return lerp(ix0, ix1, sy);
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
// ==============================================

function parseZParam(s: string | null): number[] {
  const out = Array.from({ length: 8 }, () => 0);
  if (!s) return out;
  const parts = s.split(",").slice(0, 8);
  for (let i = 0; i < parts.length; i++) {
    const v = parseFloat(parts[i]);
    out[i] = Number.isFinite(v) ? clamp(v, -2.5, 2.5) : 0;
  }
  return out;
}

// ✅ NEW: extrude blocks (ints), min 1, no negatives
function parseExParam(s: string | null): number[] {
  const out = Array.from({ length: 8 }, () => 1);
  if (!s) return out;
  const parts = s.split(",").slice(0, 8);
  for (let i = 0; i < parts.length; i++) {
    const v = Math.round(parseFloat(parts[i]));
    out[i] = Number.isFinite(v) ? clamp(v, 1, 12) : 1;
  }
  return out;
}

async function fetchPixelsUpstream(id: number): Promise<string> {
  const url = `${API_BASE}/normie/${id}/pixels`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Upstream pixels failed (${res.status})`);
  const t = (await res.text()).trim();
  if (t.length !== 1600) throw new Error(`Upstream pixel length: ${t.length}`);
  return t;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const id = clampId(parseInt(url.searchParams.get("id") ?? "0", 10));
  const z = parseZParam(url.searchParams.get("z"));
  const extrude = parseExParam(url.searchParams.get("ex")); // ✅ NEW
  const seed = clamp(
    parseInt(url.searchParams.get("seed") ?? "1", 10),
    0,
    1_000_000
  );
  const noiseScale = clamp(
    parseInt(url.searchParams.get("noise") ?? "6", 10),
    2,
    16
  );

  const starfield = 0; // AR: always statue mode (starfield breaks Quick Look)

  const pixels = await fetchPixelsUpstream(id);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(2, 4, 2);
  scene.add(sun);

  const group = new THREE.Group();
  scene.add(group);

  const W = 40,
    H = 40;
  const pixelSize = 0.08;
  const depth = 0.12;
  const halfW = (W - 1) / 2;
  const halfH = (H - 1) / 2;

  // Universe settings (same as client)
  const R = 12;
  const shellBias = 0.35;
  const freq = 1 / Math.max(1.5, noiseScale);

  // ✅ Base material reused
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#48494b"),
    roughness: 0.9,
    metalness: 0,
  });

  // ✅ NEW: build 8 geometries (one per group thickness)
  // This is efficient and keeps AR stable.
  const geomByGroup: THREE.BoxGeometry[] = Array.from({ length: 8 }, (_, g) => {
    const blocks = clamp(extrude[g] ?? 1, 1, 16);
    const thick = pixelSize * blocks; // "pixel blocks" feel
    return new THREE.BoxGeometry(pixelSize, pixelSize, thick);
  });

  let onCount = 0;

  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i] !== "1") continue;
    onCount++;

    const px = i % W;
    const py = Math.floor(i / W);

    const bx = (px - halfW) * pixelSize;
    const by = (halfH - py) * pixelSize;
    const bz = ((halfH - py) / halfH) * depth * 0.6;

    const jitter =
      (xorshift32(((i + 1) * 10007) ^ (seed * 9176)) - 0.5) *
      pixelSize *
      0.003;

    const n = noise2(px * freq, py * freq, seed + 1337); // [0,1)
    const g = Math.min(7, Math.floor(n * 8)); // 0..7

    // fade Z offsets out as starfield increases (here starfield=0)
    const zBlend = 1 - starfield;
    const zOff = (z[g] ?? 0) * zBlend;

    const baseZ = bz + jitter + zOff;

    // ---- Extrude shift: make it feel like "adding blocks"
    const blocks = clamp(extrude[g] ?? 1, 1, 12);
    const thick = pixelSize * blocks;

    // shift so extra thickness grows more in +Z (relief)
    const baseZWithExtrude = baseZ + (thick - pixelSize) * 0.5;

    // Universe target per cube (kept for parity; starfield=0 => stays statue)
    const dir = randomUnitVec(i, seed);
    const u = xorshift32(((i + 1) * 1618033) ^ (seed * 3343));
    const rVolume = Math.cbrt(u);
    const rShell = Math.pow(u, 0.12);
    const rMix = rVolume * (1 - shellBias) + rShell * shellBias;
    const radius = rMix * R;

    const tx = dir.x * radius;
    const ty = dir.y * radius;
    const tz = dir.z * radius;

    const x = lerp(bx, tx, starfield);
    const y = lerp(by, ty, starfield);
    const zPos = lerp(baseZWithExtrude, tz, starfield);

    const mesh = new THREE.Mesh(geomByGroup[g], material);
    mesh.position.set(x, y, zPos);
    group.add(mesh);
  }

  if (onCount === 0) throw new Error("No active pixels in mask.");

  group.position.set(0, 0.05, 0);

  // Center + floor for Quick Look so it appears nicely placed
  const box = new THREE.Box3().setFromObject(group);
  const center = new THREE.Vector3();
  box.getCenter(center);

  // move center to origin
  group.position.sub(center);

  // floor
  const box2 = new THREE.Box3().setFromObject(group);
  group.position.y -= box2.min.y;

  const exporter = new USDZExporter();
  const arrayBuffer = await exporter.parseAsync(scene);

  return new Response(arrayBuffer, {
    headers: {
      "Content-Type": "model/vnd.usdz+zip",
      "Content-Disposition": `inline; filename="normie-${id}.usdz"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}