"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { fetchPixels } from "../../lib/normiesApi";

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

type Cube = { x: number; y: number; z: number };

function buildVoxelsFromPixels(pixels: string, pixelSize = 0.08, depth = 0.12) {
  const W = 40, H = 40;
  const halfW = (W - 1) / 2;
  const halfH = (H - 1) / 2;

  const cubes: Cube[] = [];
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i] !== "1") continue;

    const px = i % W;
    const py = Math.floor(i / W);

    const x = (px - halfW) * pixelSize;
    const y = (halfH - py) * pixelSize;
    const z = ((halfH - py) / halfH) * depth * 0.6;

    cubes.push({ x, y, z });
  }
  return cubes;
}

export function DeadNormieAssemble({
  tokenId,
  position,
  onDone,
}: {
  tokenId: string;
  position: [number, number, number];
  onDone?: () => void;
}) {
  const [pixels, setPixels] = useState<string | null>(null);

  const geom = useMemo(() => new THREE.BoxGeometry(0.08, 0.08, 0.08), []);
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#d9d9d9"),
        roughness: 0.85,
        metalness: 0.0,
        toneMapped: false,
      }),
    []
  );

  useEffect(() => {
    return () => {
      geom.dispose();
      mat.dispose();
    };
  }, [geom, mat]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await fetchPixels(Number(tokenId));
      if (cancelled) return;
      setPixels(p);
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenId]);

  const voxels = useMemo(() => (pixels ? buildVoxelsFromPixels(pixels) : []), [pixels]);

  const instRef = useRef<THREE.InstancedMesh | null>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const start = useRef<number | null>(null);
  const done = useRef(false);

  const packed = useMemo(() => {
    const out: Cube[] = [];
    const n = voxels.length;
    const side = Math.ceil(Math.cbrt(Math.max(1, n)));
    for (let i = 0; i < n; i++) {
      const x = (i % side) - side / 2;
      const y = (Math.floor(i / side) % side) - side / 2;
      const z = Math.floor(i / (side * side)) - side / 2;
      out.push({ x: x * 0.03, y: y * 0.03, z: z * 0.03 });
    }
    return out;
  }, [voxels.length]);

  useFrame(({ clock }) => {
    const mesh = instRef.current;
    if (!mesh || voxels.length === 0) return;

    if (start.current === null) start.current = clock.elapsedTime;

    const tRaw = (clock.elapsedTime - start.current) / 0.55;
    const t = Math.max(0, Math.min(1, tRaw));
    const e = easeOutCubic(t);

    const [ox, oy, oz] = position;

    for (let i = 0; i < voxels.length; i++) {
      const a = packed[i];
      const b = voxels[i];

      dummy.position.set(
        ox + (a.x + (b.x - a.x) * e),
        oy + (0.6 + (a.y + (b.y - a.y) * e)),
        oz + (a.z + (b.z - a.z) * e)
      );

      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    if (t >= 1 && !done.current) {
      done.current = true;
      onDone?.();
    }
  });

  if (!pixels) return null;

  return <instancedMesh ref={instRef} args={[geom, mat, voxels.length]} frustumCulled={false} />;
}