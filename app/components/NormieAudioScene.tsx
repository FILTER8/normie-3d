// app/components/NormieAudioScene.tsx
"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { NormieVoxels, type MaterialMode } from "./NormieVoxels";
import * as THREE from "three";
import { NormieAmbient3d } from "../lib/NormieAmbient3d";

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

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function ExportBridge({ onReady }: { onReady: (fn: () => string) => void }) {
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

function AudioLevelBridge({
  enabled,
  intensity,
  baseStrength,
  baseSmoothing,
  onValue,
}: {
  enabled: boolean;
  intensity: number; // 0..1
  baseStrength: number; // trait baseline
  baseSmoothing: number; // trait baseline
  onValue: (v: number) => void;
}) {
  const smoothRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      smoothRef.current = 0;
      onValue(0);
      return;
    }

    let raf = 0;

    // Map INTENSITY to: more strength + less smoothing (more punch)
    const strength = clamp(baseStrength * lerp(0.65, 2.0, intensity), 0, 2.5);
    const smoothing = clamp(
      baseSmoothing + lerp(0.06, -0.1, intensity),
      0.75,
      0.98
    );

    const tick = () => {
      const raw = NormieAmbient3d.getLevel01(); // 0..1 (smoothed by engine)

      // scale by intensity strength
      const target = clamp(raw * strength, 0, 1);

      // Gate tiny values so "silence" actually collapses visuals
      const GATE = 0.015;
      const gated = target < GATE ? 0 : target;

      const prev = smoothRef.current;
      const next = prev * smoothing + gated * (1 - smoothing);
      smoothRef.current = next;

      onValue(next);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, intensity, baseStrength, baseSmoothing, onValue]);

  return null;
}

/**
 * AudioSpatialBridge
 * - listener follows camera
 * - source stays at (0,0,0) (voxels center)
 * NOTE: this only matters if the audio engine routes through a PannerNode.
 */
function AudioSpatialBridge({ enabled }: { enabled: boolean }) {
  const { camera } = useThree();

  const fwd = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!enabled) return;
    if (!NormieAmbient3d.isPlaying()) return;

    // listener position = camera position
    NormieAmbient3d.setListenerPosition({
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    });

    // listener orientation = camera forward/up
    camera.getWorldDirection(fwd);
    up.copy(camera.up).normalize();

    NormieAmbient3d.setListenerOrientation(
      { x: fwd.x, y: fwd.y, z: fwd.z },
      { x: up.x, y: up.y, z: up.z }
    );

    // sound source at scene center (voxels)
    NormieAmbient3d.setSourcePosition({ x: 0, y: 0, z: 0 });
  });

  return null;
}

export const NormieAudioScene = forwardRef<
  SceneHandle,
  {
    pixels: string | null;
    z: number[];
    extrude: number[];

    /**
     * starfield = "MAX SPREAD" (trait-based cap)
     * NOTE: we no longer treat this as the "rest" value.
     */
    starfield: number;

    seed: number;

    autoRotate: boolean;
    autoRotateSpeed?: number;

    noiseScale: number;
    lightPreset: number;
    materialMode: MaterialMode;

    // audio knobs
    audioReactiveStarfield?: boolean;
    intensity?: number; // 0..1
    audioStrengthBase?: number;
    audioSmoothingBase?: number;

    /**
     * where the starfield sits when silent (pixels come together).
     */
    restStarfield?: number;

    resetCameraZ?: number;
  }
>(function NormieAudioScene(
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

    audioReactiveStarfield = false,
    intensity = 0.65,
    audioStrengthBase = 0.35,
    audioSmoothingBase = 0.9,

    restStarfield = 0.0,
    resetCameraZ = 4.75,
  },
  ref
) {
  const exporterRef = useRef<(() => string) | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const resetAnimRef = useRef<number | null>(null);

  const targetTo = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  const posTo = useMemo(
    () => new THREE.Vector3(0, 0.6, resetCameraZ),
    [resetCameraZ]
  );

  // audio drive (0..1)
  const [audioDrive, setAudioDrive] = useState(0);

  // Silence should collapse (restStarfield).
  // Audio should OPEN UP toward starfield (trait max spread).
  const maxStarfield = clamp(starfield, 0, 1);
  const rest = clamp(restStarfield, 0, 1);

  // intensity shaping curve:
  // left (smooth) => needs more level to open up
  // right (aggressive) => opens earlier
  const curve = lerp(1.6, 0.65, clamp(intensity, 0, 1));
  const shaped = clamp(Math.pow(audioDrive, curve), 0, 1);

  const effectiveStarfield = clamp(lerp(rest, maxStarfield, shaped), 0, 1);

  useImperativeHandle(ref, () => ({
    exportPng: () => exporterRef.current?.() ?? null,

    resetFront: (ms = 650) => {
      const controls = controlsRef.current;
      const invalidate = invalidateRef.current;
      if (!controls) return;

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

        {/* camera -> listener mapping so zoom changes loudness */}
        <AudioSpatialBridge enabled={!!pixels && audioReactiveStarfield} />

        <AudioLevelBridge
          enabled={!!pixels && audioReactiveStarfield}
          intensity={intensity}
          baseStrength={audioStrengthBase}
          baseSmoothing={audioSmoothingBase}
          onValue={(v) => {
            setAudioDrive(v);
            invalidateRef.current?.();
          }}
        />

        {pixels ? (
          <NormieVoxels
            pixels={pixels}
            z={z}
            extrude={extrude}
            starfield={effectiveStarfield}
            seed={seed}
            noiseScale={noiseScale}
            materialMode={materialMode}
          />
        ) : null}

        <OrbitControls
          ref={controlsRef}
          enableDamping
          dampingFactor={0.08}
          autoRotate={audioReactiveStarfield && autoRotate}
          autoRotateSpeed={autoRotateSpeed}
          minDistance={0.8}
          maxDistance={120}
        />
      </Canvas>
    </div>
  );
});