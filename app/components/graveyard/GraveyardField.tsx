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

function tokenSeed(tokenId: string) {
  const n = Number(tokenId);
  if (Number.isFinite(n)) return Math.floor(n);

  let h = 2166136261;
  for (let i = 0; i < tokenId.length; i++) {
    h ^= tokenId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function gravePositionFromTokenId(tokenId: string) {
  const seed = tokenSeed(tokenId);

  const u = hash01(seed * 1013 + 17);
  const v = hash01(seed * 2027 + 29);
  const w = hash01(seed * 3011 + 41);

  const theta = u * Math.PI * 2;

  const ring = Math.floor(hash01(seed * 4001 + 53) * 24);
  const baseR = 18 + ring * 2.2;
  const rJitter = (v - 0.5) * 10;
  const R = THREE.MathUtils.clamp(baseR + rJitter, 14, 70);

  const phi = w * Math.PI * 2;
  const minor = 2.5 + hash01(seed * 991 + 7) * 7.5;

  const x = Math.cos(theta) * (R + Math.cos(phi) * minor);
  const z = Math.sin(theta) * (R + Math.cos(phi) * minor);
  const y = Math.sin(phi) * minor * 0.75;

  return new THREE.Vector3(x, y, z);
}

type HoverPayload = {
  burn: Burn;
  worldPos: THREE.Vector3;
} | null;

export function GraveyardField({
  burns,
  hiddenTokenIds,
  onSelect,
  onHoverChange,
  onHoverBurnChange,
}: {
  burns: Burn[];
  hiddenTokenIds: Set<string>;
  onSelect: (burn: Burn, worldPos: THREE.Vector3) => void;
  onHoverChange?: (hovering: boolean) => void;
  onHoverBurnChange?: (payload: HoverPayload) => void;
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

  const { matrices, baseScales, phases } = useMemo(() => {
    const mats: THREE.Matrix4[] = [];
    const scales: number[] = [];
    const ph: number[] = [];

    if (burns.length === 0) {
      return { matrices: mats, baseScales: scales, phases: ph };
    }

    const blockNumbers = burns
      .map((b) => b.blockNumber)
      .filter((n): n is number => Number.isFinite(n));

    const minB = blockNumbers.length ? Math.min(...blockNumbers) : 0;
    const maxB = blockNumbers.length ? Math.max(...blockNumbers) : 1;
    const span = Math.max(1, maxB - minB);

    for (let i = 0; i < burns.length; i++) {
      const burn = burns[i];
      const p = gravePositionFromTokenId(burn.tokenId);
      const seed = tokenSeed(burn.tokenId);

      const blockNumber = Number.isFinite(burn.blockNumber) ? burn.blockNumber : minB;
      const age01 = (blockNumber - minB) / span;
      const base = THREE.MathUtils.lerp(0.16, 0.42, age01);
      const jitter = hash01(seed * 97 + 3) * 0.06;
      const s = base + jitter;

      scales.push(s);
      ph.push(hash01(seed * 777 + 11) * Math.PI * 2);

      const ry = hash01(seed * 31 + 5) * Math.PI * 2;

      dummy.position.copy(p);
      dummy.rotation.set(0, ry, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();

      mats.push(dummy.matrix.clone());
    }

    return { matrices: mats, baseScales: scales, phases: ph };
  }, [burns, dummy]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    mesh.count = matrices.length;

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

  const count = matrices.length;

  return (
    <instancedMesh
      key={count}
      ref={meshRef}
      args={[geom, mat, Math.max(1, count)]}
      frustumCulled={false}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHoverChange?.(true);

        const i = e.instanceId ?? -1;
        if (i < 0) return;

        const burn = burns[i];
        if (!burn) return;
        if (hiddenTokenIds.has(burn.tokenId)) return;

        onHoverBurnChange?.({
          burn,
          worldPos: e.point.clone(),
        });
      }}
      onPointerMove={(e) => {
        e.stopPropagation();

        const i = e.instanceId ?? -1;
        if (i < 0) return;

        const burn = burns[i];
        if (!burn) return;
        if (hiddenTokenIds.has(burn.tokenId)) return;

        onHoverBurnChange?.({
          burn,
          worldPos: e.point.clone(),
        });
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHoverChange?.(false);
        onHoverBurnChange?.(null);
      }}
      onPointerMissed={() => {
        onHoverChange?.(false);
        onHoverBurnChange?.(null);
      }}
      onPointerDown={(e) => {
        e.stopPropagation();

        const i = e.instanceId ?? -1;
        if (i < 0) return;

        const burn = burns[i];
        if (!burn) return;
        if (hiddenTokenIds.has(burn.tokenId)) return;

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

        onHoverBurnChange?.(null);
        onSelect(burn, e.point.clone());
      }}
    />
  );
}