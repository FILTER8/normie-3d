"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { GraveyardField } from "./GraveyardField";
import { DeadNormieAssemble } from "./DeadNormieAssemble";
import { ShipControls } from "./ShipControls";

export type Burn = { tokenId: string; blockNumber: number; txHash: string };

function CameraFocus({
  controlsRef,
  focusTargetRef,
}: {
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  focusTargetRef: React.MutableRefObject<THREE.Vector3 | null>;
}) {
  const { camera } = useThree();

  const anim = useRef<{
    t: number; // 0..1 progress
    dur: number; // seconds
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    fromCam: THREE.Vector3;
    toCam: THREE.Vector3;
    active: boolean;
  } | null>(null);

  // Nice cinematic ease-in-out (cubic)
  const easeInOutCubic = (x: number) =>
    x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

  // Optional: cancel animation if user grabs controls
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const cancel = () => {
      if (anim.current) anim.current.active = false;
    };

    controls.addEventListener("start", cancel);
    return () => {
      controls.removeEventListener("start", cancel);
    };
  }, [controlsRef]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    // Start a new focus animation when focusTargetRef is set
    const newTarget = focusTargetRef.current;
    if (newTarget) {
      // lock the animation data once
      const fromTarget = controls.target.clone();
      const toTarget = newTarget.clone();

      const fromCam = camera.position.clone();

      // Preserve current angle (offset direction), but zoom in (shorten distance)
      const offset = camera.position.clone().sub(controls.target);

      const zoomFactor = 0.68; // cinematic: 0.6 dramatic, 0.75 moderate, 0.85 subtle
      offset.multiplyScalar(zoomFactor);

      // slight “hero” lift WITHOUT changing angle too much
      // (tiny only — remove if you dislike it)
      offset.y += 0.15;

      const toCam = toTarget.clone().add(offset);

      anim.current = {
        t: 0,
        dur: 0.9, // seconds; 1.1 slower floaty, 0.7 snappier
        fromTarget,
        toTarget,
        fromCam,
        toCam,
        active: true,
      };

      focusTargetRef.current = null; // consume trigger
    }

    const a = anim.current;
    if (!a || !a.active) return;

    // advance time
    a.t = Math.min(1, a.t + delta / a.dur);

    // easing
    const e = easeInOutCubic(a.t);

    // interpolate
    controls.target.copy(a.fromTarget).lerp(a.toTarget, e);
    camera.position.copy(a.fromCam).lerp(a.toCam, e);

    // tiny “settle” at the end (subtle damping-like feel)
    if (a.t > 0.92) {
      controls.target.lerp(a.toTarget, 0.12);
      camera.position.lerp(a.toCam, 0.12);
    }

    controls.update();

    if (a.t >= 1) {
      a.active = false;
    }
  });

  return null;
}

export function GraveyardScene({ burns }: { burns: Burn[] }) {
  const [opened, setOpened] = useState<
    Record<string, { burn: Burn; pos: [number, number, number] }>
  >({});

  const hiddenTokenIds = useMemo(() => new Set(Object.keys(opened)), [opened]);

  const bg = "#1c1c1e";
  const fog = useMemo(() => new THREE.Fog(bg, 10, 220), [bg]);

  // OrbitControls ref so we can animate target
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Where we want the camera/target to glide to
  const focusTargetRef = useRef<THREE.Vector3 | null>(null);

  // Cursor handling (linter-friendly, since gl is constructed here)
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
        canvasRef.current = gl.domElement;
      }}
    >
      <color attach="background" args={[bg]} />
      <primitive object={fog} attach="fog" />

      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 6, 2]} intensity={1.1} />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} />

      {/* Smooth “glide to token” behavior */}
      <CameraFocus controlsRef={controlsRef} focusTargetRef={focusTargetRef} />

      <ShipControls controlsRef={controlsRef} />

      <GraveyardField
        burns={burns}
        hiddenTokenIds={hiddenTokenIds}
        onSelect={(burn, worldPos) => {
          // Set focus target immediately (even if already opened) — feels responsive
          focusTargetRef.current = new THREE.Vector3(
            worldPos.x,
            worldPos.y,
            worldPos.z
          );

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