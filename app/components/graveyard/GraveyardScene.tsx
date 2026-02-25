"use client";

import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import * as THREE from "three";
import { GraveyardField } from "./GraveyardField";
import { DeadNormieAssemble } from "./DeadNormieAssemble";
import { ShipControls } from "./ShipControls";

export type Burn = { tokenId: string; blockNumber: number; txHash: string };

export function GraveyardScene({ burns }: { burns: Burn[] }) {
  const [opened, setOpened] = useState<
    Record<string, { burn: Burn; pos: [number, number, number] }>
  >({});

  // ✅ NEW: Set of opened tokenIds => hide cubes
  const hiddenTokenIds = useMemo(() => new Set(Object.keys(opened)), [opened]);

  const bg = "#1c1c1e";
  const fog = useMemo(() => new THREE.Fog(bg, 10, 220), [bg]);

  return (
    <Canvas
      camera={{ position: [0, 1.2, 10], fov: 58, near: 0.1, far: 1200 }}
      gl={{ antialias: true }}
      dpr={[1, 2]}
    >
      <color attach="background" args={[bg]} />
      <primitive object={fog} attach="fog" />

      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 6, 2]} intensity={1.1} />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} />

      <ShipControls />
<GraveyardField
  burns={burns}
  hiddenTokenIds={hiddenTokenIds}
  onSelect={(burn, worldPos) => {
    setOpened((prev) => {
      if (prev[burn.tokenId]) return prev;
      return {
        ...prev,
        [burn.tokenId]: {
          burn,
          pos: [worldPos.x, worldPos.y, worldPos.z],
        },
      };
    });
  }}
/>

      {Object.values(opened).map(({ burn, pos }) => (
        <DeadNormieAssemble
          key={burn.tokenId}
          tokenId={burn.tokenId}
          position={pos}
        />
      ))}
    </Canvas>
  );
}