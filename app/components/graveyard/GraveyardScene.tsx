"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GraveyardField } from "./GraveyardField";
import { DeadNormieAssemble } from "./DeadNormieAssemble";
import { ShipControls } from "./ShipControls";

export type Burn = { tokenId: string; blockNumber: number; txHash: string };

export function GraveyardScene({ burns }: { burns: Burn[] }) {
  const [opened, setOpened] = useState<
    Record<string, { burn: Burn; pos: [number, number, number] }>
  >({});

  const hiddenTokenIds = useMemo(() => new Set(Object.keys(opened)), [opened]);

  const bg = "#1c1c1e";
  const fog = useMemo(() => new THREE.Fog(bg, 10, 220), [bg]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const prevCursor = el.style.cursor;
    el.style.cursor = "grab";

    const onDown = () => {
      el.style.cursor = "grabbing";
    };
    const onUp = () => {
      el.style.cursor = "grab";
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);

    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      el.style.cursor = prevCursor;
    };
  }, []);

  return (
    <Canvas
      camera={{ position: [0, 1.2, 10], fov: 58, near: 0.1, far: 1200 }}
      gl={{ antialias: true }}
      dpr={[1, 2]}
      onCreated={({ gl }) => {
        // ✅ Mutation occurs where gl/domElement is constructed => linter-friendly
        canvasRef.current = gl.domElement;
      }}
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