"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { GraveyardField } from "./GraveyardField";
import { DeadNormieAssemble } from "./DeadNormieAssemble";
import { ShipControls } from "./ShipControls";
import { createGraveAudio } from "./audio";
import type { GraveAudio } from "./audio";

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
    t: number;
    dur: number;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    fromCam: THREE.Vector3;
    toCam: THREE.Vector3;
    toCamOvershoot: THREE.Vector3;
    active: boolean;
  } | null>(null);

  const easeInOutCubic = (x: number) =>
    x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const cancel = () => {
      if (anim.current) anim.current.active = false;
    };

    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controlsRef]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    const newTarget = focusTargetRef.current;
    if (newTarget) {
      const fromTarget = controls.target.clone();
      const toTarget = newTarget.clone();
      const fromCam = camera.position.clone();

      const frontDir = new THREE.Vector3(0, 0.25, 1).normalize();
      const dist = 6.2;

      const toCam = toTarget.clone().add(frontDir.clone().multiplyScalar(dist));
      const toCamOvershoot = toTarget
        .clone()
        .add(frontDir.clone().multiplyScalar(dist * 0.92));

      camera.up.set(0, 1, 0);

      anim.current = {
        t: 0,
        dur: 1.8,
        fromTarget,
        toTarget,
        fromCam,
        toCam,
        toCamOvershoot,
        active: true,
      };

      focusTargetRef.current = null;
    }

    const a = anim.current;
    if (!a || !a.active) return;

    a.t = Math.min(1, a.t + delta / a.dur);
    const e = easeInOutCubic(a.t);

    controls.target.copy(a.fromTarget).lerp(a.toTarget, e);

    if (a.t < 0.9) {
      const e1 = easeInOutCubic(a.t / 0.9);
      camera.position.copy(a.fromCam).lerp(a.toCamOvershoot, e1);
    } else {
      const e2 = easeInOutCubic((a.t - 0.9) / 0.1);
      camera.position.copy(a.toCamOvershoot).lerp(a.toCam, e2);
    }

    controls.update();
    if (a.t >= 1) a.active = false;
  });

  return null;
}

export function GraveyardScene({
  burns,
  audioEnabled,
}: {
  burns: Burn[];
  audioEnabled: boolean;
}) {
  const [opened, setOpened] = useState<
    Record<string, { burn: Burn; pos: [number, number, number] }>
  >({});

  const openedCount = Object.keys(opened).length;
  const hiddenTokenIds = useMemo(() => new Set(Object.keys(opened)), [opened]);

  const bg = "#1c1c1e";
  const fog = useMemo(() => new THREE.Fog(bg, 10, 220), [bg]);

  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const focusTargetRef = useRef<THREE.Vector3 | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ✅ NO REF READS DURING RENDER:
  // Create exactly one engine instance for the lifetime of this component.
  const audio: GraveAudio = useMemo(() => createGraveAudio(), []);

  // ✅ keep audio enabled/disabled in sync with UI toggle
  useEffect(() => {
    audio.setEnabled(audioEnabled);
  }, [audio, audioEnabled]);

  // ✅ react to opened count
  useEffect(() => {
    audio.setIntensity(openedCount);
  }, [audio, openedCount]);

  // ✅ clean up exactly once
  useEffect(() => {
    return () => {
      audio.dispose();
    };
  }, [audio]);

  // cursor + safe place to resume audio on first gesture if audio is enabled
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const prevCursor = el.style.cursor;
    el.style.cursor = "grab";

    const onDown = () => {
      el.style.cursor = "grabbing";
      if (audioEnabled) audio.ensureStarted();
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
  }, [audio, audioEnabled]);

  // ✅ keep your selection behavior intact
  const onSelect = useCallback(
    (burn: Burn, worldPos: THREE.Vector3) => {
      if (audioEnabled) {
        audio.ensureStarted();
        audio.playOpen();
      }

      focusTargetRef.current = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);

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
    },
    [audio, audioEnabled]
  );

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

      <CameraFocus controlsRef={controlsRef} focusTargetRef={focusTargetRef} />
      <ShipControls controlsRef={controlsRef} />

      <GraveyardField
        burns={burns}
        hiddenTokenIds={hiddenTokenIds}
        onSelect={onSelect}
      />

      {Object.values(opened).map(({ burn, pos }) => (
        <DeadNormieAssemble key={burn.tokenId} tokenId={burn.tokenId} position={pos} />
      ))}
    </Canvas>
  );
}