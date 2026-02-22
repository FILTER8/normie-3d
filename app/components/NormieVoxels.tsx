/* ===========================
   app/components/NormieVoxels.tsx
   Instanced performance version
   - FIX: no ref read/write during render
   - FIX: writeMatricesForCubeIndex is useCallback (deps clean)
   =========================== */
"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
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

type Cube = {
  bx: number;
  by: number;
  bz: number;
  tx: number;
  ty: number;
  tz: number;
  group: number; // 0..7
  jitter: number;
};

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
  const mode = (materialMode % 5) as MaterialMode;

  // --- Build cube descriptors once per pixels/seed/noiseScale
  const cubes: Cube[] = useMemo(() => {
    const out: Cube[] = [];

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

  // --- Materials
  const normieColor = "#48494b";

  const materials = useMemo(() => {
    if (mode === 4) {
      const arr: THREE.MeshStandardMaterial[] = [];
      for (let g = 0; g < 8; g++) {
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
      base.roughness = 0.92;
      base.metalness = 0.0;
      return [base];
    }
    if (mode === 1) {
      base.roughness = 0.18;
      base.metalness = 0.0;
      return [base];
    }
    if (mode === 2) {
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
  }, [mode, seed]);

  useEffect(() => {
    return () => {
      materials.forEach((m) => m.dispose());
    };
  }, [materials]);

  // --- Geometry: unit cube (Z scaled per instance)
  const geom = useMemo(() => new THREE.BoxGeometry(pixelSize, pixelSize, pixelSize), [pixelSize]);

  useEffect(() => {
    return () => geom.dispose();
  }, [geom]);

  // --- Group indices for pastel mode
  const indicesByGroup = useMemo(() => {
    const arr: number[][] = Array.from({ length: 8 }, () => []);
    for (let i = 0; i < cubes.length; i++) arr[cubes[i].group].push(i);
    return arr;
  }, [cubes]);

  // --- Instanced mesh refs
  const instRefSingle = useRef<THREE.InstancedMesh | null>(null);

  // ✅ FIX: initialize ONCE (no render-time ref access/mutation)
  const instRefByGroup = useRef<(THREE.InstancedMesh | null)[]>(
    Array.from({ length: 8 }, () => null)
  );

  // --- Shared dummy object to write matrices
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // ✅ FIX: make writer stable via useCallback (deps clean)
  const writeMatricesForCube = useCallback(
    (mesh: THREE.InstancedMesh, instanceId: number, cube: Cube) => {
      const zOff = z[cube.group] ?? 0;

      const rawBlocks = Math.round(exArr[cube.group] ?? 1);
      const blocks = clamp(rawBlocks, 1, 16);

      const blocksBlend = lerp(blocks, 1, starfield);
      const thick = pixelSize * blocksBlend;
      const zScale = thick / pixelSize;

      const zBlend = 1 - starfield;
      const baseZ = cube.bz + cube.jitter + zOff * zBlend;

      const x = lerp(cube.bx, cube.tx, starfield);
      const y = lerp(cube.by, cube.ty, starfield);

      const zPos = lerp(baseZ + (thick - pixelSize) * 0.5, cube.tz, starfield);

      dummy.position.set(x, y, zPos);
      dummy.scale.set(1, 1, zScale);
      dummy.updateMatrix();

      mesh.setMatrixAt(instanceId, dummy.matrix);
    },
    [dummy, exArr, pixelSize, starfield, z]
  );

  // Update single instanced mesh
  useLayoutEffect(() => {
    if (mode === 4) return;
    const mesh = instRefSingle.current;
    if (!mesh) return;

    for (let i = 0; i < cubes.length; i++) {
      writeMatricesForCube(mesh, i, cubes[i]);
    }

    mesh.instanceMatrix.needsUpdate = true;
  }, [mode, cubes, writeMatricesForCube]);

  // Update pastel mode meshes
  useLayoutEffect(() => {
    if (mode !== 4) return;

    for (let g = 0; g < 8; g++) {
      const mesh = instRefByGroup.current[g];
      if (!mesh) continue;

      const idxs = indicesByGroup[g];
      for (let j = 0; j < idxs.length; j++) {
        writeMatricesForCube(mesh, j, cubes[idxs[j]]);
      }

      mesh.instanceMatrix.needsUpdate = true;
    }
  }, [mode, cubes, indicesByGroup, writeMatricesForCube]);

  return (
    <group position={[0, 0.05, 0]}>
      {/* Modes 0..3: one instanced mesh */}
      {mode !== 4 ? (
        <instancedMesh
          ref={(m) => {
            instRefSingle.current = m;
          }}
          args={[geom, materials[0], cubes.length]}
          frustumCulled={false}
        />
      ) : null}

      {/* Mode 4: 8 instanced meshes */}
      {mode === 4
        ? Array.from({ length: 8 }).map((_, g) => {
            const count = indicesByGroup[g].length;
            if (count === 0) return null;

            return (
              <instancedMesh
                key={g}
                ref={(m) => {
                  instRefByGroup.current[g] = m;
                }}
                args={[geom, materials[g] ?? materials[0], count]}
                frustumCulled={false}
              />
            );
          })
        : null}
    </group>
  );
}