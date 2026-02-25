"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { Burn } from "./GraveyardScene";

function hash01(n: number) {
  let x = (n | 0) ^ 0x9e3779b9;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 4294967296;
}

// ✅ wider / more space
function torusPosition(i: number) {
  const u = hash01(i * 1013 + 17);
  const v = hash01(i * 2027 + 29);
  const w = hash01(i * 3011 + 41);

  const theta = u * Math.PI * 2;

  // more spread than before
  const baseR = 24 + Math.floor(i / 36) * 3.4; // bigger + expands faster
  const rJitter = (v - 0.5) * 18;              // wider jitter
  const R = THREE.MathUtils.clamp(baseR + rJitter, 18, 140);

  const phi = w * Math.PI * 2;
  const minor = 5.0 + hash01(i * 991 + 7) * 14; // thicker belt

  const x = Math.cos(theta) * (R + Math.cos(phi) * minor);
  const z = Math.sin(theta) * (R + Math.cos(phi) * minor);
  const y = Math.sin(phi) * minor * 0.9;

  return { x, y, z };
}

export function GraveyardField({
  burns,
  hiddenTokenIds,
  onSelect,
}: {
  burns: Burn[];
  hiddenTokenIds: Set<string>;
  onSelect: (burn: Burn, worldPos: THREE.Vector3) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh | null>(null);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpPos = useMemo(() => new THREE.Vector3(), []);
  const tmpQuat = useMemo(() => new THREE.Quaternion(), []);
  const tmpScale = useMemo(() => new THREE.Vector3(), []);
  const tmpMat = useMemo(() => new THREE.Matrix4(), []);

  const geom = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#9a9a9a"),
        roughness: 0.92,
        metalness: 0.0,
      }),
    []
  );

  const { matrices, positions, baseScales, phases } = useMemo(() => {
    const mats: THREE.Matrix4[] = [];
    const pos: THREE.Vector3[] = [];
    const scales: number[] = [];
    const ph: number[] = [];

    if (burns.length === 0) return { matrices: mats, positions: pos, baseScales: scales, phases: ph };

    const minB = Math.min(...burns.map((b) => b.blockNumber));
    const maxB = Math.max(...burns.map((b) => b.blockNumber));
    const span = Math.max(1, maxB - minB);

    for (let i = 0; i < burns.length; i++) {
      const p = torusPosition(i);
      const burn = burns[i];

      // newer = bigger, older = smaller
      const age01 = (burn.blockNumber - minB) / span;
      const base = THREE.MathUtils.lerp(0.14, 0.46, age01);

      const jitter = hash01(i * 97 + 3) * 0.07;
      const s = base + jitter;

      scales.push(s);
      ph.push(hash01(i * 777 + 11) * Math.PI * 2);

      const ry = hash01(i * 31 + 5) * Math.PI * 2;

      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, ry, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();

      mats.push(dummy.matrix.clone());
      pos.push(new THREE.Vector3(p.x, p.y, p.z));
    }

    return { matrices: mats, positions: pos, baseScales: scales, phases: ph };
  }, [burns, dummy]);

  const wroteInitial = useRef(false);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // initial write
    if (!wroteInitial.current) {
      wroteInitial.current = true;
      for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
      mesh.instanceMatrix.needsUpdate = true;
      return;
    }

    const t = clock.elapsedTime;
    const n = matrices.length;
    if (n === 0) return;

    const updates = Math.min(28, n);
    const start = (Math.floor(t * 60) * updates) % n;

    for (let k = 0; k < updates; k++) {
      const i = (start + k) % n;

      // if opened -> hide by scaling to 0 (still pickable only if you click exactly there,
      // but practically it's gone; if you want fully unpickable, we can also early return in handler)
      const tokenId = burns[i].tokenId;
      const hidden = hiddenTokenIds.has(tokenId);

      tmpMat.copy(matrices[i]);
      tmpMat.decompose(tmpPos, tmpQuat, tmpScale);

      const pulse = hidden ? 0 : 1 + 0.06 * Math.sin(t * 1.15 + phases[i]);
      const s = hidden ? 0 : baseScales[i] * pulse;

      dummy.position.copy(tmpPos);
      dummy.quaternion.copy(tmpQuat);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();

      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geom, mat, matrices.length]}
      frustumCulled={false}
      onPointerDown={(e) => {
        e.stopPropagation();
        const i = e.instanceId ?? -1;
        if (i < 0) return;

        const burn = burns[i];
        if (hiddenTokenIds.has(burn.tokenId)) return; // ✅ don't allow re-click

        const p = positions[i];
        if (!p) return;

        onSelect(burn, p);
      }}
    />
  );
}