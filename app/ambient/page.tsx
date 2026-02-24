/* ===========================
   app/ambient/page.tsx
   Trait-driven studio + audio-reactive starfield
   UI: AUDIO ON/OFF + VOLUME + INTENSITY + AUTO ID (40s) + COUNTDOWN
   Everything else derives from traits.
   Desktop-only gate (mobile shows clean screen)

   ✅ FIX: Auto-ID timer drift
   - Replace setInterval(AUTO_ID_MS) with self-correcting setTimeout loop
   - Countdown always tracks nextAutoAtRef (single source of truth)
   =========================== */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchPixels, fetchTraits } from "../lib/normiesApi";
import {
  NormieAudioScene,
  type SceneHandle,
} from "../components/NormieAudioScene";
import { NormieAmbient3d } from "../lib/NormieAmbient3d";
import {
  deriveStudioParams,
  type TraitsResponse,
  type Trait,
} from "../lib/NormieTraitStudio";
import type { MaterialMode } from "../components/NormieVoxels";

const APP_VERSION = "v2.0";
const AUTO_ID_MS = 40_000;

function isMobileUA() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";

  const iOSUA = /iPad|iPhone|iPod/i.test(ua);
  const iPadOS =
    navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1;

  const mobile =
    /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua) || iOSUA || iPadOS;

  return mobile;
}

function clampId(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(9999, n));
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function PixelSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.01,
  format = "float",
  showMute = false,
  onMute,
  showMax = false,
  onMax,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: "float" | "pct";
  showMute?: boolean;
  onMute?: () => void;
  showMax?: boolean;
  onMax?: () => void;
}) {
  const t = max === min ? 0 : (value - min) / (max - min);
  const pct = Math.round(clamp(t, 0, 1) * 100);
  const valueText = format === "pct" ? `${pct}` : value.toFixed(2);

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[10px]">
        <span>{label}</span>

        <div className="flex items-center gap-2">
          {showMute ? (
            <button
              onClick={onMute}
              className="border border-black/20 px-2 py-1 text-[9px] hover:bg-black/5"
              style={{ touchAction: "manipulation" }}
              title="Mute"
              type="button"
            >
              MUTE
            </button>
          ) : null}

          {showMax ? (
            <button
              onClick={onMax}
              className="border border-black/20 px-2 py-1 text-[9px] hover:bg-black/5"
              style={{ touchAction: "manipulation" }}
              title="Max"
              type="button"
            >
              MAX
            </button>
          ) : null}

          <span className="tabular-nums">
            {valueText}
            {format === "pct" ? "%" : ""}
          </span>
        </div>
      </div>

      <div className="relative mt-2">
        <div
          className="pointer-events-none absolute left-0 top-1/2 h-[10px] -translate-y-1/2 border border-black/25"
          style={{
            width: `${pct}%`,
            background: "rgba(72, 73, 75, 0.22)",
          }}
        />
        <input
          type="range"
          className="pixel-range w-full"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
}

type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function getFsElement(doc: FullscreenDoc) {
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

async function enterFullscreen(el: HTMLElement) {
  const target = el as FullscreenEl;
  if (target.requestFullscreen) return target.requestFullscreen();
  if (target.webkitRequestFullscreen) return target.webkitRequestFullscreen();
}

async function exitFullscreen() {
  const doc = document as FullscreenDoc;
  if (doc.exitFullscreen) return doc.exitFullscreen();
  if (doc.webkitExitFullscreen) return doc.webkitExitFullscreen();
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

function randomIdString() {
  return String(Math.floor(Math.random() * 10000));
}

function DesktopOnlyScreen() {
  return (
    <main className="min-h-screen bg-[#e3e5e4] text-[#48494b] flex items-center justify-center p-6">
      <div className="w-full max-w-[420px] text-center">
        <div className="text-[10px] opacity-70">NORMIES</div>
        <h1 className="mt-2 text-xl tracking-tight">AMBIENT 3D</h1>

        <p className="mt-4 text-xs opacity-75 leading-relaxed">
          Ambient mode is currently available on desktop only.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <a
            href="/"
            className="inline-block border border-black/20 bg-white/20 px-5 py-3 text-xs hover:bg-black/5 transition"
          >
            BACK
          </a>
          <a
            href="/sculpt"
            className="inline-block border border-black/20 bg-white/20 px-5 py-3 text-xs hover:bg-black/5 transition"
          >
            SCULPT
          </a>
        </div>

        <div className="mt-6 text-[10px] opacity-60">
          Tip: open this page on a laptop/desktop for audio.
        </div>
      </div>
    </main>
  );
}

/** ✅ Page only decides which component to render (stable hook order) */
export default function Page() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    setIsMobile(isMobileUA());
  }, []);

  if (isMobile === null) {
    return (
      <div className="min-h-screen bg-[#e3e5e4] text-[#48494b] flex items-center justify-center">
        <div className="text-[10px] opacity-60">loading…</div>
      </div>
    );
  }

  if (isMobile) return <DesktopOnlyScreen />;

  return <DesktopAmbient />;
}

/** ✅ All the heavy hooks live here */
function DesktopAmbient() {
  const sceneRef = useRef<SceneHandle | null>(null);
  const fullscreenTargetRef = useRef<HTMLDivElement | null>(null);
  const sceneContainerRef = useRef<HTMLDivElement | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [idInput, setIdInput] = useState<string>(() => randomIdString());
  const id = useMemo(() => clampId(parseInt(idInput, 10)), [idInput]);

  const [pixels, setPixels] = useState<string | null>(null);
  const [traits, setTraits] = useState<TraitsResponse | null>(null);
  const [status, setStatus] = useState<{ loading: boolean; error: string }>({
    loading: false,
    error: "",
  });

  const [audioOn, setAudioOn] = useState(false);
  const [volume, setVolume] = useState(0.75);
  const [intensity, setIntensity] = useState(1.0);

  const [isFullscreen, setIsFullscreen] = useState(false);

  const [autoIdOn, setAutoIdOn] = useState(false);
  // ✅ autoIdTimerRef is now a setTimeout handle (still number in browser)
  const autoIdTimerRef = useRef<number | null>(null);
  const autoCountdownTimerRef = useRef<number | null>(null);
  const nextAutoAtRef = useRef<number | null>(null);
  const [autoIn, setAutoIn] = useState(0);

  const studio = useMemo(() => deriveStudioParams(traits), [traits]);

  const newRandomId = useCallback(() => {
    setIdInput(randomIdString());
  }, []);

  useEffect(() => {
    const doc = document as FullscreenDoc;

    const onChange = () => {
      const fs = !!getFsElement(doc);
      setIsFullscreen(fs);
      if (fs) {
        setMenuOpen(false);
        setSidebarOpen(false);
      }
    };

    document.addEventListener("fullscreenchange", onChange);
    const webkitEventName = "webkitfullscreenchange" as const;
    document.addEventListener(webkitEventName, onChange as EventListener);

    onChange();
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener(webkitEventName, onChange as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  // ✅ FIXED AUTO ID: drift-free setTimeout loop + countdown tied to nextAutoAtRef
  useEffect(() => {
    // clear timers
    if (autoIdTimerRef.current !== null) {
      window.clearTimeout(autoIdTimerRef.current);
      autoIdTimerRef.current = null;
    }
    if (autoCountdownTimerRef.current !== null) {
      window.clearInterval(autoCountdownTimerRef.current);
      autoCountdownTimerRef.current = null;
    }

    if (!autoIdOn) {
      nextAutoAtRef.current = null;
      queueMicrotask(() => setAutoIn(0));
      return;
    }

    const armNext = () => {
      // single source of truth
      nextAutoAtRef.current = Date.now() + AUTO_ID_MS;
      setAutoIn(Math.ceil(AUTO_ID_MS / 1000));

      autoIdTimerRef.current = window.setTimeout(() => {
        newRandomId();
        armNext(); // schedule next cycle based on actual firing time
      }, AUTO_ID_MS);
    };

    armNext();

    autoCountdownTimerRef.current = window.setInterval(() => {
      const nextAt = nextAutoAtRef.current;
      if (!nextAt) return;
      const s = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
      setAutoIn(s);
    }, 250);

    return () => {
      if (autoIdTimerRef.current !== null) {
        window.clearTimeout(autoIdTimerRef.current);
        autoIdTimerRef.current = null;
      }
      if (autoCountdownTimerRef.current !== null) {
        window.clearInterval(autoCountdownTimerRef.current);
        autoCountdownTimerRef.current = null;
      }
    };
  }, [autoIdOn, newRandomId]);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => setStatus({ loading: true, error: "" }));

    const t = window.setTimeout(async () => {
      try {
        const [p, tr] = await Promise.all([fetchPixels(id), fetchTraits(id)]);
        if (cancelled) return;
        setPixels(p);
        setTraits(tr);
        setStatus({ loading: false, error: "" });
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Unknown error";
        setStatus({ loading: false, error: msg });
      }
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [id]);

  useEffect(() => {
    NormieAmbient3d.setData({ id, pixels, traits });
  }, [id, pixels, traits]);

  useEffect(() => {
    NormieAmbient3d.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    NormieAmbient3d.setIntensity(intensity);
  }, [intensity]);

  useEffect(() => {
    if (!audioOn) return;
    if (!pixels) return;

    void (async () => {
      NormieAmbient3d.stop();
      await NormieAmbient3d.prime();
      NormieAmbient3d.setVolume(volume);
      NormieAmbient3d.setIntensity(intensity);
      await NormieAmbient3d.start();
    })();
  }, [audioOn, id, pixels, traits, volume, intensity]);

  useEffect(() => {
    if (!pixels && audioOn) {
      NormieAmbient3d.stop();
      queueMicrotask(() => setAudioOn(false));
    }
  }, [pixels, audioOn]);

  const prevId = useCallback(() => {
    setAutoIdOn(false);
    setIdInput(String(clampId(id - 1)));
  }, [id]);

  const nextId = useCallback(() => {
    setAutoIdOn(false);
    setIdInput(String(clampId(id + 1)));
  }, [id]);

  const toggleAudio = useCallback(async () => {
    if (!pixels) return;

    if (!audioOn) {
      await NormieAmbient3d.prime();
      NormieAmbient3d.setVolume(volume);
      NormieAmbient3d.setIntensity(intensity);
      await NormieAmbient3d.start();
      setAudioOn(true);
      return;
    }

    NormieAmbient3d.stop();
    setAudioOn(false);
  }, [audioOn, pixels, volume, intensity]);

  const toggleFs = useCallback(async () => {
    const el = fullscreenTargetRef.current;
    if (!el) return;
    const doc = document as FullscreenDoc;

    if (!getFsElement(doc)) {
      setMenuOpen(false);
      setSidebarOpen(false);
      await enterFullscreen(el);
    } else {
      await exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const k = e.key.toLowerCase();

      if (k === "a") {
        e.preventDefault();
        void toggleAudio();
        return;
      }
      if (k === "f") {
        e.preventDefault();
        void toggleFs();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevId();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        nextId();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nextId, prevId, toggleAudio, toggleFs]);

  const traitList: Trait[] = traits?.attributes ?? [];

  const SidebarInner = (
    <div className="h-full overflow-y-auto overscroll-contain p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm leading-tight">AMBIENT 3D {APP_VERSION}</h2>

          <div className="mt-2 text-[10px] opacity-70">
            Audio by{" "}
            <a
              href="https://x.com/yasuna_ide"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-100"
            >
              Yasuna Ide
            </a>
          </div>

          <div className="mt-2 text-[10px] opacity-70">
            Visual by{" "}
            <a
              href="https://x.com/0xfilter8"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-100"
            >
              0xfilter8
            </a>
          </div>
        </div>

        <button
          onClick={() => void toggleFs()}
          className="border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
          style={{ touchAction: "manipulation" }}
          title="F"
          type="button"
        >
          {isFullscreen ? "EXIT" : "FULL"}
        </button>
      </div>

      <label className="mt-4 block text-[10px] opacity-80">
        TOKEN ID (0–9999)
      </label>
      <div className="mt-2 flex gap-2">
        <input
          value={idInput}
          onChange={(e) => {
            setAutoIdOn(false);
            setIdInput(e.target.value);
          }}
          inputMode="numeric"
          className="w-full border border-black/20 bg-white/60 px-3 py-2 text-[12px]"
        />
        <button
          onClick={prevId}
          className="border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
          style={{ touchAction: "manipulation" }}
          type="button"
        >
          ◀
        </button>
        <button
          onClick={nextId}
          className="border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
          style={{ touchAction: "manipulation" }}
          type="button"
        >
          ▶
        </button>
      </div>

      <div className="mt-2 flex gap-2">
        <button
          onClick={() => setAutoIdOn((v) => !v)}
          className="flex-1 border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
          style={{ touchAction: "manipulation" }}
          title="Auto ID (40s)"
          type="button"
        >
          {autoIdOn ? `AUTO ID: ON (${autoIn}s)` : "AUTO ID: OFF"}
        </button>
        <button
          onClick={() => {
            setAutoIdOn(false);
            newRandomId();
          }}
          className="border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
          style={{ touchAction: "manipulation" }}
          title="New random id"
          type="button"
        >
          NEW ID
        </button>
      </div>

      <div className="mt-3 text-[9px] opacity-70">
        {status.loading ? <div>loading…</div> : null}
        {status.error ? (
          <div className="text-red-700 opacity-100">{status.error}</div>
        ) : null}
      </div>

      <div className="mt-5">
        <div className="text-[10px] opacity-80">AUDIO</div>

        <div className="mt-2 flex gap-2">
          <button
            onClick={() => void toggleAudio()}
            disabled={!pixels}
            className="flex-1 border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5 disabled:opacity-60"
            style={{ touchAction: "manipulation" }}
            title="A"
            type="button"
          >
            {audioOn ? "AUDIO: ON" : "AUDIO: OFF"}
          </button>
        </div>

        <PixelSlider
          label="VOLUME"
          value={volume}
          onChange={(v) => setVolume(clamp(v, 0, 1))}
          min={0}
          max={1}
          step={0.01}
          format="pct"
          showMute
          onMute={() => setVolume(0)}
          showMax
          onMax={() => setVolume(1)}
        />

        <PixelSlider
          label="INTENSITY (smooth → aggressive)"
          value={intensity}
          onChange={(v) => setIntensity(clamp(v, 0, 1))}
          min={0}
          max={1}
          step={0.01}
        />

        <div className="mt-2 text-[9px] opacity-60">
          intensity also changes how hard the starfield reacts
        </div>
      </div>

      <div className="mt-8">
        <div className="text-[10px] opacity-80">TRAITS</div>
        {traitList.length === 0 ? (
          <div className="mt-2 text-[10px] opacity-60">—</div>
        ) : (
          <ul className="mt-2 space-y-1 text-[10px]">
            {traitList.map((a, i) => (
              <li key={`${a.trait_type}-${i}`}>
                <span className="opacity-70">{a.trait_type}:</span>{" "}
                {String(a.value)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 bg-[#e3e5e4] overflow-hidden"
      ref={fullscreenTargetRef}
    >
      {isFullscreen && autoIdOn ? (
        <div className="absolute left-3 top-3 z-50 pointer-events-none text-[10px] text-[#48494b] opacity-50">
          AUTO {autoIn}s
        </div>
      ) : null}

      {/* Desktop layout only */}
      <div className="hidden md:flex h-full">
        <aside
          className={`relative h-full shrink-0 flex-none overflow-hidden border-r border-black/10 bg-[#e3e5e4] text-[#48494b] transition-[width] duration-200 ${
            sidebarOpen ? "w-[360px]" : "w-[44px]"
          }`}
        >
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="absolute right-0 top-0 border-l border-b border-black/10 bg-[#e3e5e4] px-3 py-2 text-[10px] hover:bg-black/5"
            style={{ touchAction: "manipulation" }}
            title="Toggle sidebar"
            type="button"
          >
            {sidebarOpen ? "⟨⟨" : "⟩⟩"}
          </button>
          {sidebarOpen ? SidebarInner : null}
        </aside>

        <main
          className="relative flex-1 min-w-0 bg-[#e3e5e4] cursor-grab active:cursor-grabbing"
          ref={sceneContainerRef}
          style={{ touchAction: "none" }}
        >
          <NormieAudioScene
            ref={sceneRef}
            pixels={pixels}
            z={Array.from({ length: 8 }, () => 0)}
            extrude={Array.from({ length: 8 }, () => 1)}
            starfield={studio.baseStarfield}
            seed={id}
            autoRotate={studio.autoRotate}
            autoRotateSpeed={studio.autoRotateSpeed}
            noiseScale={studio.noiseScale}
            lightPreset={studio.lightPreset}
            materialMode={studio.materialMode as MaterialMode}
            audioReactiveStarfield={audioOn}
            intensity={intensity}
            audioStrengthBase={studio.audioStarStrengthBase}
            audioSmoothingBase={studio.audioSmoothingBase}
            restStarfield={0.0}
          />
        </main>
      </div>

      <style jsx global>{`
        canvas {
          touch-action: none;
        }
        .pixel-range {
          -webkit-appearance: none;
          appearance: none;
          height: 10px;
          background: rgba(72, 73, 75, 0.18);
          border: 1px solid rgba(0, 0, 0, 0.25);
        }
        .pixel-range:focus {
          outline: none;
        }
        .pixel-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          background: #48494b;
          border: 1px solid rgba(0, 0, 0, 0.35);
          border-radius: 0;
          cursor: pointer;
        }
        .pixel-range::-moz-range-thumb {
          width: 14px;
          height: 14px;
          background: #48494b;
          border: 1px solid rgba(0, 0, 0, 0.35);
          border-radius: 0;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
  
}