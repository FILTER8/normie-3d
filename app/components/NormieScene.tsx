/* ===========================
   app/components/NormieScene.tsx
   LIGHT presets + MATERIAL passthrough
   =========================== */
"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type RefObject,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { NormieVoxels, type MaterialMode } from "./NormieVoxels";

export type SceneHandle = { exportPng: () => string | null };

function ExportBridge({ onReady }: { onReady: (fn: () => string) => void }) {
  const { gl } = useThree();
  // stable: store exporter fn in ref via callback in parent
  onReady(() => gl.domElement.toDataURL("image/png"));
  return null;
}

function Lights({ preset }: { preset: number }) {
  // 0..4
  switch (preset % 5) {
    case 0: // Studio (default)
      return (
        <>
          <ambientLight intensity={1.15} />
          <directionalLight position={[2, 3, 2]} intensity={1.1} />
          <directionalLight position={[-2, 1, 2]} intensity={0.55} />
        </>
      );

    case 1: // Top Light
      return (
        <>
          <ambientLight intensity={0.85} />
          <directionalLight position={[0, 5, 0]} intensity={1.45} />
          <directionalLight position={[2, 1, 2]} intensity={0.25} />
        </>
      );

    case 2: // Rim Light
      return (
        <>
          <ambientLight intensity={0.55} />
          <directionalLight position={[0.5, 2, -4]} intensity={1.6} />
          <directionalLight position={[-1.5, 1, 3]} intensity={0.45} />
        </>
      );

    case 3: // Flat (very readable)
      return (
        <>
          <ambientLight intensity={1.6} />
          <directionalLight position={[0, 2, 2]} intensity={0.25} />
        </>
      );

    case 4: // Dramatic
      return (
        <>
          <ambientLight intensity={0.35} />
          <directionalLight position={[3, 4, 1]} intensity={1.75} />
          <directionalLight position={[-3, 1, 2]} intensity={0.25} />
        </>
      );

    default:
      return null;
  }
}

export const NormieScene = forwardRef<
  SceneHandle,
  {
    pixels: string | null;
    z: number[];
    extrude: number[];
    starfield: number;
    seed: number;
    autoRotate: boolean;
    noiseScale: number;
    lightPreset: number; // ✅ NEW
    materialMode: MaterialMode; // ✅ NEW
    containerRef?: RefObject<HTMLDivElement | null>;
  }
>(function NormieScene(
  {
    pixels,
    z,
    extrude,
    starfield,
    seed,
    autoRotate,
    noiseScale,
    lightPreset,
    materialMode,
    containerRef,
  },
  ref
) {
  const exporterRef = useRef<(() => string) | null>(null);

  useImperativeHandle(ref, () => ({
    exportPng: () => exporterRef.current?.() ?? null,
  }));

  return (
    <div ref={containerRef} className="h-full w-full">
      <Canvas
        camera={{ position: [0, 0.6, 2.2], fov: 45, near: 0.1, far: 600 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
      >
        <color attach="background" args={["#e3e5e4"]} />

        <Lights preset={lightPreset} />

        <ExportBridge onReady={(fn) => (exporterRef.current = fn)} />

        {pixels ? (
          <NormieVoxels
            pixels={pixels}
            z={z}
            extrude={extrude}
            starfield={starfield}
            seed={seed}
            noiseScale={noiseScale}
            materialMode={materialMode} // ✅ NEW
          />
        ) : null}

        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          autoRotate={autoRotate}
          autoRotateSpeed={0.7}
          minDistance={0.8}
          maxDistance={120}
        />
      </Canvas>
    </div>
  );
});