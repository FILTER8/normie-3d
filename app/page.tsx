/* ===========================
   app/page.tsx
   v1.6 — Scroll isolation + Desktop foldable menu + Preset labels
   + ROT button cycles: OFF → SMOOTH → MIDDLE → FAST → OFF
   + Smaller loading text
   + Smooth RESET: pixels gather (starfield→0, z→0, extrude→1) + camera turns to front
   =========================== */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPixels, fetchTraits } from "./lib/normiesApi";
import { NormieScene, type SceneHandle } from "./components/NormieScene";
import type { MaterialMode } from "./components/NormieVoxels";

const APP_VERSION = "v1.6";

type Trait = { trait_type: string; value: string | number | boolean | null };
type TraitsResponse = { attributes?: Trait[] };

function clampId(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(9999, n));
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpArr(a: number[], b: number[], t: number) {
  const out = new Array(Math.max(a.length, b.length));
  for (let i = 0; i < out.length; i++) out[i] = lerp(a[i] ?? 0, b[i] ?? 0, t);
  return out;
}

function PixelSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.01,
  int = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  int?: boolean;
}) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[10px]">
        <span>{label}</span>
        <span className="tabular-nums">
          {int ? Math.round(value) : value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        className="pixel-range mt-2 w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          onChange(int ? Math.round(v) : v);
        }}
      />
    </div>
  );
}

// Mobile-friendly export: defer heavy work so UI updates first
async function downloadWithStamp(
  dataUrl: string,
  filename: string,
  stamp: string
) {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const img = new Image();
  img.decoding = "async";

  img.onload = async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(img, 0, 0);

    const pad = Math.max(6, Math.floor(canvas.width * 0.01));
    const fontSize = Math.max(7, Math.floor(canvas.width * 0.006));

    ctx.font = `${fontSize}px "Press Start 2P", monospace`;
    ctx.textBaseline = "bottom";
    ctx.textAlign = "right";

    const x = canvas.width - pad;
    const y = canvas.height - pad;

    const metrics = ctx.measureText(stamp);
    const w = Math.ceil(metrics.width);
    const h = Math.ceil(fontSize * 1.2);

    ctx.fillStyle = "rgba(227,229,228,0.45)";
    ctx.fillRect(x - w - 5, y - h + 3, w + 8, h);

    ctx.fillStyle = "#48494b";
    ctx.fillText(stamp, x, y);

    const out = canvas.toDataURL("image/png");

    const a = document.createElement("a");
    a.href = out;
    a.download = filename;
    a.click();
  };

  img.src = dataUrl;
}

type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

async function toggleFullscreen(el: HTMLElement) {
  const doc = document as FullscreenDoc;
  const fsEl = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;

  if (!fsEl) {
    const target = el as FullscreenEl;
    if (target.requestFullscreen) {
      await target.requestFullscreen();
      return;
    }
    if (target.webkitRequestFullscreen) {
      await target.webkitRequestFullscreen();
      return;
    }
    return;
  }

  if (doc.exitFullscreen) {
    await doc.exitFullscreen();
    return;
  }
  if (doc.webkitExitFullscreen) {
    await doc.webkitExitFullscreen();
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

function cycle(n: number, mod: number) {
  return (n + 1) % mod;
}

const LIGHT_NAMES = ["STUDIO", "TOP", "RIM", "FLAT", "DRAMA"] as const;
const MAT_NAMES = ["MATTE", "GLOSS", "CHROME", "GLOW", "PASTEL"] as const;

// ✅ ROT button cycles 4 modes
const ROT_LABELS = ["OFF", "SMOOTH", "MIDDLE", "FAST"] as const;
// ⬇️ Adjust rotation speeds here:
const ROT_SPEEDS = [0, 0.7, 1.5, 3.0] as const;
type RotMode = 0 | 1 | 2 | 3;

export default function Page() {
  const sceneRef = useRef<SceneHandle | null>(null);
  const sceneContainerRef = useRef<HTMLDivElement | null>(null);

  // mobile drawer
  const [menuOpen, setMenuOpen] = useState(false);
  // desktop fold
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [isExporting, setIsExporting] = useState(false);

  const [idInput, setIdInput] = useState("0");
  const id = useMemo(() => clampId(parseInt(idInput, 10)), [idInput]);

  const [pixels, setPixels] = useState<string | null>(null);
  const [traits, setTraits] = useState<TraitsResponse | null>(null);
  const [status, setStatus] = useState({ loading: false, error: "" });

  const Z_MIN = -2.5;
  const Z_MAX = 2.5;

  const [z, setZ] = useState<number[]>(() =>
    Array.from({ length: 8 }, () => 0)
  );
  const [extrude, setExtrude] = useState<number[]>(() =>
    Array.from({ length: 8 }, () => 1)
  );

  const [starfield, setStarfield] = useState(0);
  const [noiseScale, setNoiseScale] = useState(6);

  const [seed, setSeed] = useState(1);

  // ✅ Rotation mode (OFF/SMOOTH/MIDDLE/FAST)
  const [rotMode, setRotMode] = useState<RotMode>(2); // default MIDDLE
  const rotLabel = ROT_LABELS[rotMode];
  const autoRotate = rotMode !== 0;
  const autoRotateSpeed = ROT_SPEEDS[rotMode];
  const cycleRotMode = () => setRotMode((m) => (((m + 1) % 4) as RotMode));

  const [lightPreset, setLightPreset] = useState(0); // 0..4
  const [materialMode, setMaterialMode] = useState<MaterialMode>(0); // 0..4

  const lightName = LIGHT_NAMES[lightPreset % 5];
  const matName = MAT_NAMES[(materialMode % 5) as 0 | 1 | 2 | 3 | 4];

  // ✅ Lock body scroll when mobile menu is open
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  // ✅ Random ID on first load
  useEffect(() => {
    setIdInput(String(Math.floor(Math.random() * 10000)));
  }, []);

  // ---- Data loading
  useEffect(() => {
    let cancelled = false;
    setStatus({ loading: true, error: "" });

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

  const setZAt = (idx: number, value: number) => {
    setZ((prev) => {
      const next = prev.slice();
      next[idx] = value;
      return next;
    });
  };

  const setExAt = (idx: number, value: number) => {
    setExtrude((prev) => {
      const next = prev.slice();
      next[idx] = value;
      return next;
    });
  };

  const setId = (next: number) => setIdInput(String(clampId(next)));
  const prevId = () => setId(id - 1);
  const nextId = () => setId(id + 1);

  const randomizeZ = () => {
    const rZ = () => Math.random() * (Z_MAX - Z_MIN) + Z_MIN;
    setZ(Array.from({ length: 8 }, () => rZ()));
    setSeed((s) => s + 1);
  };

  const randomizeExtrude = () => {
    const rE = () => Math.floor(Math.random() * 16) + 1;
    setExtrude(Array.from({ length: 8 }, () => rE()));
    setSeed((s) => s + 1);
  };

  const randomizeBlob = () => {
    const v = Math.floor(Math.random() * (16 - 2 + 1)) + 2; // 2..16
    setNoiseScale(v);
    setSeed((s) => s + 1);
  };

  // ✅ Smooth RESET: camera -> front + gather pixels nicely
  const reset = () => {
    // static targets
    const z0 = Array.from({ length: 8 }, () => 0);
    const ex0 = Array.from({ length: 8 }, () => 1);

    const zFrom = z.slice();
    const exFrom = extrude.slice();
    const starFrom = starfield;

    // immediate reset for "non-animated" toggles
    setNoiseScale(6);
    setLightPreset(0);
    setMaterialMode(0);

    // camera to front (requires NormieScene handle update below)
    sceneRef.current?.resetFront?.(650);

    const start = performance.now();
    const dur = 1250;

    const tick = (now: number) => {
      const t = clamp((now - start) / dur, 0, 1);
      const e = easeInOutCubic(t);

      setStarfield(lerp(starFrom, 0, e));
      setZ(lerpArr(zFrom, z0, e));
      setExtrude(lerpArr(exFrom, ex0, e));

      if (t < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  };

  const cycleLight = () => setLightPreset((p) => cycle(p, 5));
  const cycleMaterial = () =>
    setMaterialMode((m) => (cycle(m, 5) as MaterialMode));

  const chaos = () => {
    const rZ = () => Math.random() * (Z_MAX - Z_MIN) + Z_MIN;
    const rE = () => Math.floor(Math.random() * 16) + 1;
    const rNoise = () => Math.floor(Math.random() * (16 - 2 + 1)) + 2;

    setZ(Array.from({ length: 8 }, () => rZ()));
    setExtrude(Array.from({ length: 8 }, () => rE()));
    setNoiseScale(rNoise());
    setStarfield(Math.random() < 0.25 ? 0 : clamp(Math.random(), 0, 1));
    setLightPreset(Math.floor(Math.random() * 5));
    setMaterialMode(Math.floor(Math.random() * 5) as MaterialMode);
    setSeed((s) => s + 1);
  };

  const exportPng = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      const dataUrl = sceneRef.current?.exportPng();
      if (!dataUrl) return;

      const filename = `normie-3d-${id}.png`;
      const stamp = `normie-3d ${APP_VERSION} #${id} - by 0xfilter8`;
      await downloadWithStamp(dataUrl, filename, stamp);
    } finally {
      window.setTimeout(() => setIsExporting(false), 300);
    }
  };

  // ---- Keyboard shortcuts
  // S save, R rot mode cycle, F fullscreen, B random blob
  // L light, M material, C chaos
  // ArrowLeft/ArrowRight prev/next id
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const k = e.key.toLowerCase();

      if (k === "s") {
        e.preventDefault();
        void exportPng();
        return;
      }
      if (k === "r") {
        e.preventDefault();
        cycleRotMode();
        return;
      }
      if (k === "f") {
        e.preventDefault();
        const el = sceneContainerRef.current;
        if (el) void toggleFullscreen(el);
        return;
      }
      if (k === "b") {
        e.preventDefault();
        randomizeBlob();
        return;
      }
      if (k === "l") {
        e.preventDefault();
        cycleLight();
        return;
      }
      if (k === "m") {
        e.preventDefault();
        cycleMaterial();
        return;
      }
      if (k === "c") {
        e.preventDefault();
        chaos();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isExporting, menuOpen, sidebarOpen, lightPreset, materialMode, rotMode, starfield, z, extrude]);

  // ---- Swipe left/right + double tap randomize
  useEffect(() => {
    const el = sceneContainerRef.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let lastTapT = 0;

    const onTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return;
      const t = ev.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();

      const now = Date.now();
      if (now - lastTapT < 260) {
        randomizeZ();
        lastTapT = 0;
      } else {
        lastTapT = now;
      }
    };

    const onTouchEnd = (ev: TouchEvent) => {
      const t = ev.changedTouches[0];
      if (!t) return;

      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = Date.now() - startT;

      if (dt < 420 && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        if (dx < 0) nextId();
        else prevId();
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ✅ Long press on scene = RESET (works for touch + mouse)
  useEffect(() => {
    const el = sceneContainerRef.current;
    if (!el) return;

    let timer: number | null = null;
    let downX = 0;
    let downY = 0;
    let moved = false;

    const clear = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;

      moved = false;
      downX = e.clientX;
      downY = e.clientY;

      clear();
      timer = window.setTimeout(() => {
        if (!moved) reset();
      }, 650);
    };

    const onPointerMove = (e: PointerEvent) => {
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        moved = true;
        clear();
      }
    };

    const onPointerUp = () => clear();
    const onPointerCancel = () => clear();

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
      clear();
    };
  }, [reset]);

  const arHref =
    `/api/ar/usdz?id=${id}` +
    `&z=${encodeURIComponent(z.join(","))}` +
    `&ex=${encodeURIComponent(extrude.join(","))}` +
    `&seed=${seed}` +
    `&noise=${noiseScale}` +
    `&star=0`;

  const SidebarInner = (
    <div className="h-full overflow-y-auto overscroll-contain p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm leading-tight">NORMIES 3D {APP_VERSION}</h2>
          <a
            href="https://x.com/0xfilter8"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-[10px] underline opacity-80 hover:opacity-100"
          >
            by 0xfilter
          </a>
        </div>

        <button
          onClick={chaos}
          className="border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
          style={{ touchAction: "manipulation" }}
          title="C"
        >
          CHAOS
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={cycleLight}
          className="flex-1 border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
          style={{ touchAction: "manipulation" }}
          title="L"
        >
          LIGHT: {lightName}
        </button>
        <button
          onClick={cycleMaterial}
          className="flex-1 border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
          style={{ touchAction: "manipulation" }}
          title="M"
        >
          MAT: {matName}
        </button>
      </div>

      <label className="mt-4 block text-[10px] opacity-80">
        TOKEN ID (0–9999)
      </label>
      <div className="mt-2 flex gap-2">
        <input
          value={idInput}
          onChange={(e) => setIdInput(e.target.value)}
          inputMode="numeric"
          className="w-full border border-black/20 bg-white/60 px-3 py-2 text-[12px]"
        />
        <button
          onClick={prevId}
          className="border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
          style={{ touchAction: "manipulation" }}
          title="Prev"
        >
          ◀
        </button>
        <button
          onClick={nextId}
          className="border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
          style={{ touchAction: "manipulation" }}
          title="Next"
        >
          ▶
        </button>
      </div>

      {/* ✅ smaller loading */}
      <div className="mt-3 text-[9px] opacity-70">
        {status.loading && <div>loading…</div>}
        {status.error && (
          <div className="text-red-700 opacity-100">{status.error}</div>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => void exportPng()}
          disabled={isExporting}
          className="flex-1 border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5 disabled:opacity-60"
          style={{ touchAction: "manipulation" }}
          title="S"
        >
          {isExporting ? "SAVING…" : "EXPORT PNG"}
        </button>
        <button
          onClick={reset}
          className="border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
          style={{ touchAction: "manipulation" }}
        >
          RESET
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        {/* ✅ ROT button cycles modes */}
        <button
          onClick={cycleRotMode}
          className="flex-1 border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
          style={{ touchAction: "manipulation" }}
          title="R"
        >
          ROT: {rotLabel}
        </button>

        <button
          onClick={() => {
            const el = sceneContainerRef.current;
            if (el) void toggleFullscreen(el);
          }}
          className="border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
          style={{ touchAction: "manipulation" }}
          title="F"
        >
          FULL
        </button>
      </div>

      <div className="mt-6">
        <div className="text-[10px] opacity-80">GROUP STYLE</div>
        <PixelSlider
          label="BLOB SIZE"
          value={noiseScale}
          onChange={(v) => setNoiseScale(clamp(Math.round(v), 2, 16))}
          min={2}
          max={16}
          step={1}
          int
        />
        <button
          onClick={randomizeBlob}
          className="mt-3 w-full border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
          style={{ touchAction: "manipulation" }}
          title="B"
        >
          RANDOM BLOB
        </button>
        <button
          onClick={() => setSeed((s) => s + 1)}
          className="mt-3 w-full border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
          style={{ touchAction: "manipulation" }}
        >
          REROLL GROUPS
        </button>
      </div>

      <div className="mt-6">
        <div className="text-[10px] opacity-80">EXTRUDE (BLOCKS)</div>
        {Array.from({ length: 8 }).map((_, i) => (
          <PixelSlider
            key={i}
            label={`${i + 1}`}
            value={extrude[i]}
            onChange={(v) => setExAt(i, clamp(Math.round(v), 1, 16))}
            min={1}
            max={16}
            step={1}
            int
          />
        ))}
        <button
          onClick={randomizeExtrude}
          className="mt-3 w-full border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
          style={{ touchAction: "manipulation" }}
        >
          RANDOM EXTRUDE
        </button>
      </div>

      <div className="mt-6">
        <div className="text-[10px] opacity-80">DEPTH (8 GROUPS)</div>
        {Array.from({ length: 8 }).map((_, i) => (
          <PixelSlider
            key={i}
            label={`${i + 1}`}
            value={z[i]}
            onChange={(v) => setZAt(i, v)}
            min={Z_MIN}
            max={Z_MAX}
            step={0.01}
          />
        ))}
      </div>

      <div className="mt-6">
        <div className="text-[10px] opacity-80">UNIVERSE</div>
        <PixelSlider
          label="STARFIELD"
          value={starfield}
          onChange={setStarfield}
          min={0}
          max={1}
          step={0.01}
        />
      </div>

      <div className="mt-8">
        <div className="text-[10px] opacity-80">TRAITS</div>
        {!traits?.attributes?.length ? (
          <div className="mt-2 text-[10px] opacity-60">—</div>
        ) : (
          <ul className="mt-2 space-y-1 text-[10px]">
            {traits.attributes.map((a: Trait, i: number) => (
              <li key={i}>
                <span className="opacity-70">{a.trait_type}:</span>{" "}
                {String(a.value)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8">
        <a
          href={arHref}
          className="block border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5 text-center"
        >
          AR (iPhone)
        </a>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-[#e3e5e4] overflow-hidden">
      {/* Top bar (mobile only) */}
      <div className="md:hidden flex items-center justify-between border-b border-black/10 px-3 py-2 gap-2">
        <div className="text-[10px] text-[#48494b] whitespace-nowrap">
          NORMIES 3D {APP_VERSION}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <a
            href={arHref}
            className="border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5 inline-block whitespace-nowrap"
            style={{ touchAction: "manipulation" }}
          >
            AR
          </a>

          <button
            className="border border-black/20 px-3 py-2 text-[10px] text-[#48494b] hover:bg-black/5 whitespace-nowrap"
            style={{ touchAction: "manipulation" }}
            onClick={() => setMenuOpen(true)}
          >
            MENU
          </button>
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden md:flex h-full">
        <aside
          className={`relative h-full shrink-0 flex-none overflow-hidden border-r border-black/10 bg-[#e3e5e4] text-[#48494b] transition-[width] duration-200 ${
            sidebarOpen ? "w-[380px]" : "w-[44px]"
          }`}
        >
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="absolute right-0 top-0 border-l border-b border-black/10 bg-[#e3e5e4] px-3 py-2 text-[10px] hover:bg-black/5"
            style={{ touchAction: "manipulation" }}
            title="Toggle sidebar"
          >
            {sidebarOpen ? "⟨⟨" : "⟩⟩"}
          </button>

          {sidebarOpen ? SidebarInner : null}
        </aside>

        <main
          className="relative flex-1 min-w-0 bg-[#e3e5e4]"
          ref={sceneContainerRef}
        >
          <NormieScene
            ref={sceneRef}
            pixels={pixels}
            z={z}
            extrude={extrude}
            starfield={starfield}
            seed={seed}
            autoRotate={autoRotate}
            autoRotateSpeed={autoRotateSpeed}
            noiseScale={noiseScale}
            lightPreset={lightPreset}
            materialMode={materialMode}
          />
        </main>
      </div>

      {/* Mobile scene */}
      <div
        className="md:hidden relative bg-[#e3e5e4]"
        style={{ height: "calc(100% - 41px)" }}
        ref={sceneContainerRef}
      >
        <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
          <button
            onClick={prevId}
            className="border border-black/20 bg-[#e3e5e4]/80 px-3 py-2 text-[10px] text-[#48494b]"
            style={{ touchAction: "manipulation" }}
            aria-label="Previous"
          >
            ◀
          </button>
          <div className="border border-black/20 bg-[#e3e5e4]/80 px-3 py-2 text-[10px] text-[#48494b]">
            #{id}
          </div>
          <button
            onClick={nextId}
            className="border border-black/20 bg-[#e3e5e4]/80 px-3 py-2 text-[10px] text-[#48494b]"
            style={{ touchAction: "manipulation" }}
            aria-label="Next"
          >
            ▶
          </button>
        </div>

        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          <button
            onClick={() => void exportPng()}
            disabled={isExporting}
            className="border border-black/20 bg-[#e3e5e4]/80 px-3 py-2 text-[10px] text-[#48494b] disabled:opacity-60"
            style={{ touchAction: "manipulation" }}
            title="S"
          >
            {isExporting ? "SAVING…" : "SAVE"}
          </button>

          <button
            onClick={chaos}
            className="border border-black/20 bg-[#e3e5e4]/80 px-3 py-2 text-[10px] text-[#48494b]"
            style={{ touchAction: "manipulation" }}
            title="C"
          >
            CHAOS
          </button>
        </div>

        <NormieScene
          ref={sceneRef}
          pixels={pixels}
          z={z}
          extrude={extrude}
          starfield={starfield}
          seed={seed}
          autoRotate={autoRotate}
          autoRotateSpeed={autoRotateSpeed}
          noiseScale={noiseScale}
          lightPreset={lightPreset}
          materialMode={materialMode}
        />
      </div>

      {/* Mobile drawer */}
      {menuOpen ? (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMenuOpen(false)}
            style={{ touchAction: "manipulation" }}
          />
          <div className="absolute left-0 top-0 h-full w-[320px] border-r border-black/10 bg-[#e3e5e4] text-[#48494b] flex flex-col">
            <div className="flex items-center justify-between border-b border-black/10 px-3 py-2">
              <div className="text-[10px]">MENU</div>
              <button
                className="border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
                style={{ touchAction: "manipulation" }}
                onClick={() => setMenuOpen(false)}
              >
                CLOSE
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain">
              {SidebarInner}
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
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
        .pixel-range::-webkit-slider-runnable-track {
          height: 10px;
          border-radius: 0;
        }
        .pixel-range::-moz-range-thumb {
          width: 14px;
          height: 14px;
          background: #48494b;
          border: 1px solid rgba(0, 0, 0, 0.35);
          border-radius: 0;
          cursor: pointer;
        }
        .pixel-range::-moz-range-track {
          height: 10px;
          background: rgba(72, 73, 75, 0.18);
          border: 1px solid rgba(0, 0, 0, 0.25);
          border-radius: 0;
        }
      `}</style>
    </div>
  );
}