"use client";

import { OrbitControls } from "@react-three/drei";
import { useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export function ShipControls() {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

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