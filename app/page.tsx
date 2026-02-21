/* ===========================
   app/page.tsx
   v1.4 — Mobile export UX improved + AR params include extrude
   =========================== */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPixels, fetchTraits } from "./lib/normiesApi";
import { NormieScene, type SceneHandle } from "./components/NormieScene";

const APP_VERSION = "v1.4";

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

async function downloadWithStamp(dataUrl: string, filename: string, stamp: string) {
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

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function Page() {
  const sceneRef = useRef<SceneHandle | null>(null);
  const sceneContainerRef = useRef<HTMLDivElement | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [idInput, setIdInput] = useState("0");
  const id = useMemo(() => clampId(parseInt(idInput, 10)), [idInput]);

  const [pixels, setPixels] = useState<string | null>(null);
  const [traits, setTraits] = useState<TraitsResponse | null>(null);
  const [status, setStatus] = useState({ loading: false, error: "" });

  const Z_MIN = -2.5;
  const Z_MAX = 2.5;

  // integer extrude blocks
  const EX_MIN = 1;
  const EX_MAX = 16;

  const [z, setZ] = useState<number[]>(
    () => Array.from({ length: 8 }, () => 0)
  );

  const [extrude, setExtrude] = useState<number[]>(
    () => Array.from({ length: 8 }, () => 1)
  );

  const [starfield, setStarfield] = useState(0);
  const [noiseScale, setNoiseScale] = useState(6);

  const [seed, setSeed] = useState(1);
  const [autoRotate, setAutoRotate] = useState(true);

  useEffect(() => {
    setIdInput(String(Math.floor(Math.random() * 10000)));
  }, []);

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

  const setExtrudeAt = (idx: number, value: number) => {
    setExtrude((prev) => {
      const next = prev.slice();
      next[idx] = value;
      return next;
    });
  };

  const setId = (next: number) => setIdInput(String(clampId(next)));
  const prevId = () => setId(id - 1);
  const nextId = () => setId(id + 1);

  const randomizeAll = () => {
    const rZ = () => Math.random() * (Z_MAX - Z_MIN) + Z_MIN;
    const rE = () => Math.floor(Math.random() * (EX_MAX - EX_MIN + 1)) + EX_MIN;

    setZ(Array.from({ length: 8 }, () => rZ()));
    setExtrude(Array.from({ length: 8 }, () => rE()));
    setSeed((s) => s + 1);
  };

  const randomizeBlob = () => {
    const v = Math.floor(Math.random() * (16 - 2 + 1)) + 2;
    setNoiseScale(v);
    setSeed((s) => s + 1);
  };

  const reset = () => {
    setZ(Array.from({ length: 8 }, () => 0));
    setExtrude(Array.from({ length: 8 }, () => 1));
    setStarfield(0);
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
  }, [id, isExporting]);

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
        randomizeAll();
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
  }, []);

  const arHref = `/api/ar/usdz?id=${id}` +
    `&z=${encodeURIComponent(z.join(","))}` +
    `&ex=${encodeURIComponent(extrude.join(","))}` +
    `&seed=${seed}` +
    `&noise=${noiseScale}` +
    `&star=0`;

  const Sidebar = (
    <div className="bg-[#e3e5e4] text-[#48494b] border-r border-black/10 p-4 h-full overflow-auto">
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
          onClick={randomizeAll}
          className="border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
          style={{ touchAction: "manipulation" }}
          title="Double-tap on scene (mobile) randomizes"
        >
          RANDOM
        </button>
      </div>

      <label className="mt-4 block text-[10px] opacity-80">TOKEN ID (0–9999)</label>
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

      <div className="mt-3 text-[10px]">
        {status.loading && <div>LOADING…</div>}
        {status.error && <div className="text-red-700">{status.error}</div>}
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
        <button
          onClick={() => setAutoRotate((v) => !v)}
          className="flex-1 border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
          style={{ touchAction: "manipulation" }}
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
          onChange={(v) => setNoiseScale(Math.max(2, Math.min(16, Math.round(v))))}
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
        <div className="text-[10px] opacity-80">DEPTH (8 GROUPS)</div>
        {Array.from({ length: 8 }).map((_, i) => (
          <PixelSlider
            key={i}
            label={`${i + 1}`}
            value={z[i]}
            onChange={(v) => setZAt(i, clamp(v, Z_MIN, Z_MAX))}
            min={Z_MIN}
            max={Z_MAX}
            step={0.01}
          />
        ))}
      </div>

      <div className="mt-6">
        <div className="text-[10px] opacity-80">EXTRUDE (BLOCKS)</div>
        {Array.from({ length: 8 }).map((_, i) => (
          <PixelSlider
            key={i}
            label={`${i + 1}`}
            value={extrude[i]}
            onChange={(v) => setExtrudeAt(i, clamp(Math.round(v), EX_MIN, EX_MAX))}
            min={EX_MIN}
            max={EX_MAX}
            step={1}
            int
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
                <span className="opacity-70">{a.trait_type}:</span> {String(a.value)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-screen bg-[#e3e5e4]" style={{ touchAction: "manipulation" }}>
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

      {/* Desktop */}
      <div className="hidden md:grid h-[calc(100vh)] grid-cols-[380px_1fr]">
        <aside>{Sidebar}</aside>
        <main className="relative bg-[#e3e5e4]" ref={sceneContainerRef}>
          <NormieScene
            ref={sceneRef}
            pixels={pixels}
            z={z}
            extrude={extrude}
            starfield={starfield}
            seed={seed}
            autoRotate={autoRotate}
            noiseScale={noiseScale}
            containerRef={sceneContainerRef}
          />
        </main>
      </div>

      {/* Mobile scene */}
      <div
        className="md:hidden relative h-[calc(100vh-41px)] bg-[#e3e5e4]"
        ref={sceneContainerRef}
      >
        <div className="absolute left-3 top-3 flex items-center gap-2">
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

        <div className="absolute right-3 top-3 flex items-center gap-2">
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
            onClick={randomizeAll}
            className="border border-black/20 bg-[#e3e5e4]/80 px-3 py-2 text-[10px] text-[#48494b]"
            style={{ touchAction: "manipulation" }}
            title="Double tap"
          >
            RAND
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
          noiseScale={noiseScale}
          containerRef={sceneContainerRef}
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
          <div className="absolute left-0 top-0 h-full w-[320px] border-r border-black/10 bg-[#e3e5e4]">
            <div className="flex items-center justify-between border-b border-black/10 px-3 py-2">
              <div className="text-[10px] text-[#48494b]">MENU</div>
              <button
                className="border border-black/20 px-3 py-2 text-[10px] text-[#48494b] hover:bg-black/5"
                style={{ touchAction: "manipulation" }}
                onClick={() => setMenuOpen(false)}
              >
                CLOSE
              </button>
            </div>
            {Sidebar}
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