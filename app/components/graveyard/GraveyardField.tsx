"use client";

import { useEffect, useMemo, useRef } from "react";
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

function torusPosition(i: number) {
  const u = hash01(i * 1013 + 17);
  const v = hash01(i * 2027 + 29);
  const w = hash01(i * 3011 + 41);

  const theta = u * Math.PI * 2;
  const baseR = 18 + Math.floor(i / 40) * 2.2;
  const rJitter = (v - 0.5) * 10;
  const R = THREE.MathUtils.clamp(baseR + rJitter, 14, 70);

  const phi = w * Math.PI * 2;
  const minor = 2.5 + hash01(i * 991 + 7) * 7.5;

  const x = Math.cos(theta) * (R + Math.cos(phi) * minor);
  const z = Math.sin(theta) * (R + Math.cos(phi) * minor);
  const y = Math.sin(phi) * minor * 0.75;

  return { x, y, z };
}

export function GraveyardField({
  burns,
  hiddenTokenIds,
  onSelect,
  onHoverChange,
}: {
  burns: Burn[];
  hiddenTokenIds: Set<string>;
  onSelect: (burn: Burn, worldPos: THREE.Vector3) => void;
  onHoverChange?: (hovering: boolean) => void; // ✅ optional
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

  // ✅ Base (non-hidden) matrices/metadata – independent of hiddenTokenIds
  const { matrices, baseScales, phases } = useMemo(() => {
    const mats: THREE.Matrix4[] = [];
    const scales: number[] = [];
    const ph: number[] = [];

    if (burns.length === 0) return { matrices: mats, baseScales: scales, phases: ph };

    const minB = Math.min(...burns.map((b) => b.blockNumber));
    const maxB = Math.max(...burns.map((b) => b.blockNumber));
    const span = Math.max(1, maxB - minB);

    for (let i = 0; i < burns.length; i++) {
      const burn = burns[i];
      const p = torusPosition(i);

      const age01 = (burn.blockNumber - minB) / span;
      const base = THREE.MathUtils.lerp(0.16, 0.42, age01);
      const jitter = hash01(i * 97 + 3) * 0.06;
      const s = base + jitter;

      scales.push(s);
      ph.push(hash01(i * 777 + 11) * Math.PI * 2);

      const ry = hash01(i * 31 + 5) * Math.PI * 2;

      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, ry, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();

      mats.push(dummy.matrix.clone());
    }

    return { matrices: mats, baseScales: scales, phases: ph };
  }, [burns, dummy]);

  // ✅ Critical: write instance matrices as soon as we have them (no “refresh needed”)
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (matrices.length === 0) return;

    for (let i = 0; i < matrices.length; i++) {
      const burn = burns[i];
      if (!burn) continue;

      tmpMat.copy(matrices[i]);
      tmpMat.decompose(tmpPos, tmpQuat, tmpScale);

      const hidden = hiddenTokenIds.has(burn.tokenId);
      dummy.position.copy(tmpPos);
      dummy.quaternion.copy(tmpQuat);
      dummy.scale.setScalar(hidden ? 0 : tmpScale.x);
      dummy.updateMatrix();

      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  }, [matrices, burns, hiddenTokenIds, dummy, tmpMat, tmpPos, tmpQuat, tmpScale]);

  // ✅ Twinkle loop (only for visible instances)
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const n = matrices.length;
    if (n === 0) return;

    const t = clock.elapsedTime;

    const updates = Math.min(24, n);
    const start = (Math.floor(t * 60) * updates) % n;

    for (let k = 0; k < updates; k++) {
      const i = (start + k) % n;

      const burn = burns[i];
      if (!burn) continue;
      if (hiddenTokenIds.has(burn.tokenId)) continue;

      tmpMat.copy(matrices[i]);
      tmpMat.decompose(tmpPos, tmpQuat, tmpScale);

      const pulse = 1 + 0.06 * Math.sin(t * 1.15 + phases[i]);

      dummy.position.copy(tmpPos);
      dummy.quaternion.copy(tmpQuat);
      dummy.scale.setScalar(baseScales[i] * pulse);
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
      onPointerOver={() => onHoverChange?.(true)}
      onPointerOut={() => onHoverChange?.(false)}
      // ✅ Open on pointer DOWN (most reliable with OrbitControls)
      onPointerDown={(e) => {
        e.stopPropagation();

        const i = e.instanceId ?? -1;
        if (i < 0) return;

        const burn = burns[i];
        if (!burn) return;
        if (hiddenTokenIds.has(burn.tokenId)) return;

        // ✅ Instant hide (per-instance) by scaling to 0
        const mesh = meshRef.current;
        if (mesh) {
          mesh.getMatrixAt(i, tmpMat);
          tmpMat.decompose(tmpPos, tmpQuat, tmpScale);

          dummy.position.copy(tmpPos);
          dummy.quaternion.copy(tmpQuat);
          dummy.scale.setScalar(0);
          dummy.updateMatrix();

          mesh.setMatrixAt(i, dummy.matrix);
          mesh.instanceMatrix.needsUpdate = true;
        }

        // ✅ world-space hit point for focusing/camera
        onSelect(burn, e.point.clone());
      }}
    />
  );
}