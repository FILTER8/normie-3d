/* ===========================
   app/components/NormieScene.tsx
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
import { NormieVoxels } from "./NormieVoxels";

export type SceneHandle = { exportPng: () => string | null };

function ExportBridge({ onReady }: { onReady: (fn: () => string) => void }) {
  const { gl } = useThree();
  onReady(() => gl.domElement.toDataURL("image/png"));
  return null;
}

export const NormieScene = forwardRef<
  SceneHandle,
  {
    pixels: string | null;
    z: number[];
    starfield: number;
    seed: number;
    autoRotate: boolean;
    noiseScale: number;
    containerRef?: RefObject<HTMLDivElement | null>;
  }
>(function NormieScene(
  { pixels, z, starfield, seed, autoRotate, noiseScale, containerRef },
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

        <ambientLight intensity={1.3} />
        <directionalLight position={[2, 3, 2]} intensity={1.0} />
        <directionalLight position={[-2, 1, 2]} intensity={0.5} />

        <ExportBridge onReady={(fn) => (exporterRef.current = fn)} />

        {pixels ? (
          <NormieVoxels
            pixels={pixels}
            z={z}
            starfield={starfield}
            seed={seed}
            noiseScale={noiseScale}
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