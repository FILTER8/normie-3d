"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Text, Billboard } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { GraveyardField, gravePositionFromTokenId } from "./GraveyardField";
import { DeadNormieAssemble } from "./DeadNormieAssemble";
import { ShipControls } from "./ShipControls";
import { createGraveAudio } from "./audio";
import type { GraveAudio } from "./audio";

export type Burn = { tokenId: string; blockNumber: number; txHash: string };

type HoverLabelData = {
  burn: Burn;
  pos: THREE.Vector3;
};

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

function HoverTokenLabel({
  burn,
  position,
  visible,
}: {
  burn: Burn | null;
  position: THREE.Vector3 | null;
  visible: boolean;
}) {
  const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const opacityRef = useRef(0);

  useFrame((state, delta) => {
    const targetOpacity = visible ? 1 : 0;

    opacityRef.current = THREE.MathUtils.lerp(
      opacityRef.current,
      targetOpacity,
      1 - Math.exp(-7 * delta)
    );

    if (materialRef.current) {
      materialRef.current.opacity = opacityRef.current;
    }

    if (groupRef.current && position) {
      const floatY = Math.sin(state.clock.elapsedTime * 2.4) * 0.03;
      groupRef.current.position.set(
        position.x,
        position.y + 0.5 + floatY,
        position.z
      );
    }
  });

  if (!burn || !position) return null;

  return (
    <Billboard ref={groupRef}>
      <Text
        font="/fonts/press-start-2p.ttf"
        fontSize={0.16}
        anchorX="center"
        anchorY="middle"
        color="#e3e5e4"
      >
        #{burn.tokenId}
        <meshBasicMaterial
          ref={materialRef}
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
        />
      </Text>
    </Billboard>
  );
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

  const [hovered, setHovered] = useState<HoverLabelData | null>(null);
  const [hoverLabel, setHoverLabel] = useState<HoverLabelData | null>(null);

  const hoverClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bg = "#1c1c1e";
  const fog = useMemo(() => new THREE.Fog(bg, 10, 220), [bg]);

  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const focusTargetRef = useRef<THREE.Vector3 | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const focusedDeepLinkTokenRef = useRef<string | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token");

  const audio: GraveAudio = useMemo(() => createGraveAudio(), []);

  const deepLinkedEntry = useMemo(() => {
    if (!tokenFromUrl) return null;

    const burn = burns.find((b) => b.tokenId === tokenFromUrl);
    if (!burn) return null;

    const pos = gravePositionFromTokenId(burn.tokenId);

    return {
      burn,
      pos: [pos.x, pos.y, pos.z] as [number, number, number],
      focusPos: pos,
    };
  }, [tokenFromUrl, burns]);

  const combinedOpened = useMemo(() => {
    if (!deepLinkedEntry) return opened;
    if (opened[deepLinkedEntry.burn.tokenId]) return opened;

    return {
      ...opened,
      [deepLinkedEntry.burn.tokenId]: {
        burn: deepLinkedEntry.burn,
        pos: deepLinkedEntry.pos,
      },
    };
  }, [opened, deepLinkedEntry]);

  const openedCount = Object.keys(combinedOpened).length;
  const hiddenTokenIds = useMemo(
    () => new Set(Object.keys(combinedOpened)),
    [combinedOpened]
  );

  useEffect(() => {
    audio.setEnabled(audioEnabled);
  }, [audio, audioEnabled]);

  useEffect(() => {
    audio.setIntensity(openedCount);
  }, [audio, openedCount]);

  useEffect(() => {
    return () => {
      audio.dispose();
    };
  }, [audio]);

  useEffect(() => {
    return () => {
      if (hoverClearTimeoutRef.current) {
        clearTimeout(hoverClearTimeoutRef.current);
      }
    };
  }, []);

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

  const updateUrlToken = useCallback(
    (tokenId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("token", tokenId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

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

      updateUrlToken(burn.tokenId);
    },
    [audio, audioEnabled, updateUrlToken]
  );

  const handleHoverBurnChange = useCallback((payload: HoverLabelData | null) => {
    if (hoverClearTimeoutRef.current) {
      clearTimeout(hoverClearTimeoutRef.current);
      hoverClearTimeoutRef.current = null;
    }

    if (!payload) {
      setHovered(null);
      hoverClearTimeoutRef.current = setTimeout(() => {
        setHoverLabel(null);
        hoverClearTimeoutRef.current = null;
      }, 180);
      return;
    }

    const nextPayload = {
      burn: payload.burn,
      pos: payload.pos.clone(),
    };

    setHovered(nextPayload);
    setHoverLabel(nextPayload);
  }, []);

  useEffect(() => {
    if (!deepLinkedEntry) return;
    if (focusedDeepLinkTokenRef.current === deepLinkedEntry.burn.tokenId) return;

    focusedDeepLinkTokenRef.current = deepLinkedEntry.burn.tokenId;
    focusTargetRef.current = deepLinkedEntry.focusPos.clone();
  }, [deepLinkedEntry]);

  return (
    <Canvas
      camera={{ position: [0, 1.2, 10], fov: 58, near: 0.1, far: 1200 }}
      gl={{ antialias: true, alpha: false }}
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
        onHoverChange={() => {}}
        onHoverBurnChange={(payload) => {
          if (!payload) {
            handleHoverBurnChange(null);
            return;
          }

          handleHoverBurnChange({
            burn: payload.burn,
            pos: payload.worldPos.clone(),
          });
        }}
      />

      <HoverTokenLabel
        burn={hoverLabel?.burn ?? null}
        position={hoverLabel?.pos ?? null}
        visible={Boolean(hovered)}
      />

      {Object.values(combinedOpened).map(({ burn, pos }) => (
        <DeadNormieAssemble
          key={burn.tokenId}
          tokenId={burn.tokenId}
          position={pos}
        />
      ))}
    </Canvas>
  );
}