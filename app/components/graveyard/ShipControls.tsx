"use client";

import { OrbitControls } from "@react-three/drei";
import { useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export function ShipControls({
  controlsRef,
}: {
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
}) {
  const localRef = useRef<OrbitControlsImpl | null>(null);

  return (
    <OrbitControls
      ref={(c) => {
        localRef.current = c;
        controlsRef.current = c;
      }}
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