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

      // ✅ “Reset to front” direction (world-space)
      // Feel free to tweak this vector to define your “front”.
      // (0, 0.25, 1) = slightly above, looking from +Z toward the token.
      const frontDir = new THREE.Vector3(0, 0.25, 1).normalize();

      // ✅ Distance from the token (controls how tight it is)
      const dist = 6.2;

      // ✅ Final camera position
      const toCam = toTarget.clone().add(frontDir.multiplyScalar(dist));

      // ✅ Small cinematic overshoot (go a bit closer then settle back)
      const overshootDir = new THREE.Vector3(0, 0.22, 1).normalize();
      const toCamOvershoot = toTarget.clone().add(overshootDir.multiplyScalar(dist * 0.92));

      // Keep camera upright
      camera.up.set(0, 1, 0);

      anim.current = {
        t: 0,
        dur: 3.5, // a touch slower for cinematic
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

    // target always eases straight to the token
    controls.target.copy(a.fromTarget).lerp(a.toTarget, e);

    // camera: first 80% goes to overshoot, last 20% settles to final
    if (a.t < 0.82) {
      const e1 = easeInOutCubic(a.t / 0.82);
      camera.position.copy(a.fromCam).lerp(a.toCamOvershoot, e1);
    } else {
      const e2 = easeInOutCubic((a.t - 0.82) / 0.18);
      camera.position.copy(a.toCamOvershoot).lerp(a.toCam, e2);
    }

    controls.update();

    if (a.t >= 1) a.active = false;
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