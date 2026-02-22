/* ===========================
   app/components/NormieScene.tsx
   LIGHT presets + MATERIAL passthrough
   - FIX: remove duplicate containerRef attachment
   - FIX: no explicit any (OrbitControlsImpl)
   - FIX: no gl.scene/gl.camera usage
   - NEW: autoRotateSpeed prop
   - NEW: resetFront(ms) → smoothly return OrbitControls to front view
   =========================== */
"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { NormieVoxels, type MaterialMode } from "./NormieVoxels";
import * as THREE from "three";

export type SceneHandle = {
  exportPng: () => string | null;
  resetFront: (ms?: number) => void;
};

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function ExportBridge({
  onReady,
}: {
  onReady: (fn: () => string) => void;
}) {
  const { gl } = useThree();

  useEffect(() => {
    onReady(() => gl.domElement.toDataURL("image/png"));
  }, [gl, onReady]);

  return null;
}

function InvalidateBridge({ onReady }: { onReady: (fn: () => void) => void }) {
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    onReady(() => invalidate());
  }, [invalidate, onReady]);

  return null;
}

function Lights({ preset }: { preset: number }) {
  switch (preset % 5) {
    case 0:
      return (
        <>
          <ambientLight intensity={1.15} />
          <directionalLight position={[2, 3, 2]} intensity={1.1} />
          <directionalLight position={[-2, 1, 2]} intensity={0.55} />
        </>
      );
    case 1:
      return (
        <>
          <ambientLight intensity={0.85} />
          <directionalLight position={[0, 5, 0]} intensity={1.45} />
          <directionalLight position={[2, 1, 2]} intensity={0.25} />
        </>
      );
    case 2:
      return (
        <>
          <ambientLight intensity={0.55} />
          <directionalLight position={[0.5, 2, -4]} intensity={1.6} />
          <directionalLight position={[-1.5, 1, 3]} intensity={0.45} />
        </>
      );
    case 3:
      return (
        <>
          <ambientLight intensity={1.6} />
          <directionalLight position={[0, 2, 2]} intensity={0.25} />
        </>
      );
    case 4:
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
    autoRotateSpeed?: number;
    noiseScale: number;
    lightPreset: number;
    materialMode: MaterialMode;
    // optional: if you want reset to match your initial camera
    resetCameraZ?: number;
  }
>(function NormieScene(
  {
    pixels,
    z,
    extrude,
    starfield,
    seed,
    autoRotate,
    autoRotateSpeed = 0.7,
    noiseScale,
    lightPreset,
    materialMode,
    resetCameraZ = 2.75, // ✅ keep consistent with your "25% smaller" setting
  },
  ref
) {
  const exporterRef = useRef<(() => string) | null>(null);

  // ✅ typed controls ref (no any)
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // invalidate function stored, so we can force redraw during reset animation
  const invalidateRef = useRef<(() => void) | null>(null);

  // Prevent overlapping reset animations
  const resetAnimRef = useRef<number | null>(null);

  // These targets are stable objects (avoid allocating per reset call)
  const targetTo = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  const posTo = useMemo(
    () => new THREE.Vector3(0, 0.6, resetCameraZ),
    [resetCameraZ]
  );

  useImperativeHandle(ref, () => ({
    exportPng: () => exporterRef.current?.() ?? null,

    resetFront: (ms = 650) => {
      const controls = controlsRef.current;
      const invalidate = invalidateRef.current;
      if (!controls) return;

      // cancel any running animation
      if (resetAnimRef.current !== null) {
        cancelAnimationFrame(resetAnimRef.current);
        resetAnimRef.current = null;
      }

      const targetFrom = controls.target.clone();
      const posFrom = controls.object.position.clone();

      const start = performance.now();

      const tick = (now: number) => {
        const t = clamp((now - start) / ms, 0, 1);
        const e = easeInOutCubic(t);

        controls.target.lerpVectors(targetFrom, targetTo, e);
        controls.object.position.lerpVectors(posFrom, posTo, e);

        controls.update();
        invalidate?.();

        if (t < 1) resetAnimRef.current = requestAnimationFrame(tick);
        else resetAnimRef.current = null;
      };

      resetAnimRef.current = requestAnimationFrame(tick);
    },
  }));

  useEffect(() => {
    return () => {
      if (resetAnimRef.current !== null) {
        cancelAnimationFrame(resetAnimRef.current);
        resetAnimRef.current = null;
      }
    };
  }, []);

  return (
    <div className="h-full w-full">
      <Canvas
        camera={{
          position: [0, 0.6, resetCameraZ],
          fov: 45,
          near: 0.1,
          far: 600,
        }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        dpr={[1, 2]}
      >
        <color attach="background" args={["#e3e5e4"]} />

        <Lights preset={lightPreset} />

        <ExportBridge onReady={(fn) => (exporterRef.current = fn)} />
        <InvalidateBridge onReady={(fn) => (invalidateRef.current = fn)} />

        {pixels ? (
          <NormieVoxels
            pixels={pixels}
            z={z}
            extrude={extrude}
            starfield={starfield}
            seed={seed}
            noiseScale={noiseScale}
            materialMode={materialMode}
          />
        ) : null}

        <OrbitControls
          ref={controlsRef}
          enableDamping
          dampingFactor={0.08}
          autoRotate={autoRotate}
          autoRotateSpeed={autoRotateSpeed}
          minDistance={0.8}
          maxDistance={120}
        />
      </Canvas>
    </div>
  );
});