"use client";

import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export function ShipControls() {
  const { gl } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Keep cursor always visible + prevent the canvas from "capturing" it
  useEffect(() => {
    const el = gl.domElement;

    const prevCursor = el.style.cursor;
    el.style.cursor = "grab";

    const onDown = () => (el.style.cursor = "grabbing");
    const onUp = () => (el.style.cursor = "grab");

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);

    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      el.style.cursor = prevCursor;
    };
  }, [gl.domElement]);

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.085}
      rotateSpeed={0.55}
      zoomSpeed={0.9}
      panSpeed={0.7}
      enablePan
      screenSpacePanning
      minDistance={3}
      maxDistance={240}
      maxPolarAngle={Math.PI * 0.95}
    />
  );
}