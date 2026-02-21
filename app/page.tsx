/* ===========================
   app/page.tsx
   =========================== */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPixels, fetchTraits } from "./lib/normiesApi";
import { NormieScene, type SceneHandle } from "./components/NormieScene";

type Trait = { trait_type: string; value: string | number | boolean | null };
type TraitsResponse = { attributes?: Trait[] };

function clampId(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(9999, n));
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

function downloadWithStamp(dataUrl: string, filename: string, stamp: string) {
  const img = new Image();
  img.onload = () => {
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

export default function Page() {
  const sceneRef = useRef<SceneHandle | null>(null);
  const sceneContainerRef = useRef<HTMLDivElement | null>(null);

  const [idInput, setIdInput] = useState("0");
  const id = useMemo(() => clampId(parseInt(idInput, 10)), [idInput]);

  const [pixels, setPixels] = useState<string | null>(null);
  const [traits, setTraits] = useState<TraitsResponse | null>(null);
  const [status, setStatus] = useState({ loading: false, error: "" });

  const Z_MIN = -2.5;
  const Z_MAX = 2.5;

  const [z, setZ] = useState<number[]>(
    () => Array.from({ length: 8 }, () => 0)
  );
  const [starfield, setStarfield] = useState(0);
  const [noiseScale, setNoiseScale] = useState(6);

  const [seed, setSeed] = useState(1);
  const [autoRotate, setAutoRotate] = useState(true);

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
    }, 250);

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

  const randomizeZ = () => {
    const rZ = () => Math.random() * (Z_MAX - Z_MIN) + Z_MIN;
    setZ(Array.from({ length: 8 }, () => rZ()));
    setSeed((s) => s + 1);
  };

  const randomizeBlob = () => {
    const v = Math.floor(Math.random() * (16 - 2 + 1)) + 2; // 2..16
    setNoiseScale(v);
    setSeed((s) => s + 1);
  };

  const reset = () => {
    setZ(Array.from({ length: 8 }, () => 0));
    setStarfield(0);
  };

  const exportPng = () => {
    const dataUrl = sceneRef.current?.exportPng();
    if (!dataUrl) return;
    const filename = `normie-3d-${id}.png`;
    const stamp = `normie-3d #${id}`;
    downloadWithStamp(dataUrl, filename, stamp);
  };

  // Keyboard shortcuts:
  // S = save, R = rotation toggle, F = fullscreen, B = random blob
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const k = e.key.toLowerCase();

      if (k === "s") {
        e.preventDefault();
        exportPng();
        return;
      }

      if (k === "r") {
        e.preventDefault();
        setAutoRotate((v) => !v);
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
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="grid h-screen grid-cols-[380px_1fr]">
      <aside className="bg-[#e3e5e4] text-[#48494b] border-r border-black/10 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm leading-tight">NORMIES 3D</h2>
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
            onClick={randomizeZ}
            className="border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
            title="(Z randomize)"
          >
            RANDOM Z
          </button>
        </div>

        <label className="mt-4 block text-[10px] opacity-80">TOKEN ID (0–9999)</label>
        <input
          value={idInput}
          onChange={(e) => setIdInput(e.target.value)}
          inputMode="numeric"
          className="mt-2 w-full border border-black/20 bg-white/60 px-3 py-2 text-[12px]"
        />

        <div className="mt-3 text-[10px]">
          {status.loading && <div>LOADING…</div>}
          {status.error && <div className="text-red-700">{status.error}</div>}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={exportPng}
            className="flex-1 border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
            title="S"
          >
            EXPORT PNG
          </button>
          <button
            onClick={reset}
            className="border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
          >
            RESET
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setAutoRotate((v) => !v)}
            className="flex-1 border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
            title="R"
          >
            ROTATION: {autoRotate ? "ON" : "OFF"}
          </button>
          <button
            onClick={() => {
              const el = sceneContainerRef.current;
              if (el) void toggleFullscreen(el);
            }}
            className="border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
            title="F"
          >
            FULLSCREEN
          </button>
        </div>

        <div className="mt-6">
          <div className="text-[10px] opacity-80">GROUP STYLE</div>
          <PixelSlider
            label="BLOB SIZE"
            value={noiseScale}
            onChange={(v) => setNoiseScale(Math.max(2, Math.min(16, Math.round(v))))}
            min={2}
            max={16}
            step={1}
            int
          />
          <button
            onClick={randomizeBlob}
            className="mt-3 w-full border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
            title="B"
          >
            RANDOM BLOB
          </button>
          <button
            onClick={() => setSeed((s) => s + 1)}
            className="mt-3 w-full border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
          >
            REROLL GROUPS
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
      </aside>

      <main className="bg-[#e3e5e4]" ref={sceneContainerRef}>
        <NormieScene
          ref={sceneRef}
          pixels={pixels}
          z={z}
          starfield={starfield}
          seed={seed}
          autoRotate={autoRotate}
          noiseScale={noiseScale}
          containerRef={sceneContainerRef}
        />
      </main>
    </div>
  );
}