/* ===========================
   app/reduction/page.tsx

   ✅ Keep ORIGINAL colors (no extra outer background color)
   ✅ ID centered UNDER token
   ✅ Use pixel font (via CSS var / class hook)
   ✅ When ID toggle ON: make a square “framed tile”
      - tile stays SQUARE
      - token is inset (padding all around)
      - ID sits in the bottom padding area (inside the square)
      - (frame is OPTIONAL — removed by default)

   ✅ Grid sizes up to 10×10
   ✅ Gap + border + export
   ✅ RANDOM button loads different grid each time
   ✅ Threshold slider for reduction (controls ink cutoff)

   Supports BOTH upstream formats:
   - Monochrome: "0" / "1"
   - Hex levels: "0".."f" (0..15)

   Two-tone:
   - LIGHT bg
   - DARK ink
   - Ink when avg >= threshold
   =========================== */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPixels } from "../lib/normiesApi";

function clampId(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(9999, n));
}

function errMessage(e: unknown, fallback: string) {
  if (e instanceof Error) return e.message || fallback;
  if (typeof e === "string") return e || fallback;
  return fallback;
}

function parseNormiesPixelString(
  raw: string
): { w: number; h: number; levels: number[]; format: "binary" | "hex" } {
  const s = raw.trim();
  if (s.length !== 1600) throw new Error(`Unexpected pixel length: ${s.length} (expected 1600)`);

  const w = 40;
  const h = 40;

  const isBinary = /^[01]+$/.test(s);
  const format: "binary" | "hex" = isBinary ? "binary" : "hex";

  const levels = new Array<number>(1600);
  for (let i = 0; i < 1600; i++) {
    const c = s[i];
    if (isBinary) {
      levels[i] = c === "1" ? 1 : 0;
    } else {
      const v = parseInt(c, 16);
      if (Number.isNaN(v)) {
        throw new Error(`Bad pixel char "${c}" at index ${i}. Expected 0/1 or hex 0-9/a-f.`);
      }
      levels[i] = v; // 0..15
    }
  }

  return { w, h, levels, format };
}

/**
 * Reduce 40x40 levels into nxn averages (floats).
 * Threshold is applied at draw-time.
 */
function reduceLevels40ToN(levels40: number[], n: number): number[] {
  const srcW = 40;
  const srcH = 40;
  const out = new Array<number>(n * n);

  for (let oy = 0; oy < n; oy++) {
    const y0 = Math.floor((oy * srcH) / n);
    const y1 = Math.floor(((oy + 1) * srcH) / n);

    for (let ox = 0; ox < n; ox++) {
      const x0 = Math.floor((ox * srcW) / n);
      const x1 = Math.floor(((ox + 1) * srcW) / n);

      let sum = 0;
      let count = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += levels40[y * srcW + x];
          count++;
        }
      }

      out[oy * n + ox] = count ? sum / count : 0; // float avg
    }
  }

  return out;
}

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[10px]">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <input
        type="range"
        className="pixel-range mt-2 w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
      />
    </div>
  );
}

function SliderFloat({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.01,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[10px]">
        <span>{label}</span>
        <span className="tabular-nums">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        className="pixel-range mt-2 w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

type GridSize = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

function randInt(maxExclusive: number) {
  return Math.floor(Math.random() * maxExclusive);
}

function makeRandomUniqueIds(count: number) {
  const out: number[] = [];
  const used = new Set<number>();
  let guard = 0;

  while (out.length < count && guard < 200000) {
    guard++;
    const id = randInt(10000);
    if (used.has(id)) continue;
    used.add(id);
    out.push(id);
  }
  return out;
}

function arraysEqual(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [idInput, setIdInput] = useState("0");
  const baseId = useMemo(() => clampId(parseInt(idInput, 10)), [idInput]);

  const [status, setStatus] = useState({ loading: false, error: "" });

  const [outSize, setOutSize] = useState(8); // 8..40
  const [scale, setScale] = useState(16); // per reduced pixel
  const [gridSize, setGridSize] = useState<GridSize>(1);
  const [gap, setGap] = useState(12);
  const [border, setBorder] = useState(24);
  const [showIds, setShowIds] = useState(false);

  // Threshold: controls ink cutoff on reduced averages.
  // We set it in "binary space" (0..1) and scale it for hex automatically at draw-time.
  const [threshold01, setThreshold01] = useState(0.5);

  const [gridIds, setGridIds] = useState<number[]>([0]);
  const [pixelsById, setPixelsById] = useState<Record<number, string>>({});

  // ORIGINAL COLORS — do not change
  const LIGHT = "#e3e5e4";
  const DARK = "#48494b";

  const setNewRandomGrid = (size: GridSize) => {
    const count = size * size;
    const prev = gridIds;

    for (let attempt = 0; attempt < 50; attempt++) {
      const next = makeRandomUniqueIds(count);
      if (!arraysEqual(next, prev)) {
        setGridIds(next);
        setIdInput(String(next[0] ?? 0));
        return;
      }
    }

    const next = makeRandomUniqueIds(count);
    setGridIds(next);
    setIdInput(String(next[0] ?? 0));
  };

  const setGridFromBaseId = (size: GridSize, firstId: number) => {
    const count = size * size;
    const ids: number[] = [];
    for (let i = 0; i < count; i++) ids.push((firstId + i) % 10000);
    setGridIds(ids);
  };

  // First mount: randomize
  useEffect(() => {
    setNewRandomGrid(gridSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Grid size or base id changes: sequential fill
  useEffect(() => {
    setGridFromBaseId(gridSize, baseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridSize, baseId]);

  // Load pixels for every id in grid
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setStatus({ loading: true, error: "" });
      try {
        const unique = Array.from(new Set(gridIds));
        const results = await Promise.all(
          unique.map(async (id) => {
            const p = await fetchPixels(id);
            return [id, p] as const;
          })
        );
        if (cancelled) return;

        setPixelsById((prev) => {
          const next = { ...prev };
          for (const [id, p] of results) next[id] = p;
          return next;
        });

        setStatus({ loading: false, error: "" });
      } catch (e: unknown) {
        if (cancelled) return;
        setStatus({ loading: false, error: errMessage(e, "Failed to load pixels") });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gridIds]);

  // Draw whole grid into ONE canvas (export includes border+gap)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cols = gridSize;
    const rows = gridSize;

    const tokenW = outSize * scale;
    const tokenH = outSize * scale;

    // Square tile system when IDs are on:
    // - keep square
    // - reserve label space INSIDE square at bottom
    const framePad = showIds ? Math.max(8, Math.min(24, Math.floor(scale * 1.1))) : 0;
    const labelH = showIds ? Math.max(12, Math.min(22, Math.floor(scale * 1.0))) : 0;

    const tileSide = tokenW + framePad * 2;

    const totalW = border * 2 + cols * tileSide + (cols - 1) * gap;
    const totalH = border * 2 + rows * tileSide + (rows - 1) * gap;

    canvas.width = totalW;
    canvas.height = totalH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    // Background everywhere = LIGHT (unchanged)
    ctx.fillStyle = LIGHT;
    ctx.fillRect(0, 0, totalW, totalH);

    // If you ever want a frame back, set to true
    const DRAW_FRAME = false;

    const drawTile = (tileIndex: number, id: number) => {
      const col = tileIndex % cols;
      const row = Math.floor(tileIndex / cols);

      const ox = border + col * (tileSide + gap);
      const oy = border + row * (tileSide + gap);

      // Tile background
      ctx.fillStyle = LIGHT;
      ctx.fillRect(ox, oy, tileSide, tileSide);

      // Optional frame (currently disabled)
      if (showIds && DRAW_FRAME) {
        ctx.strokeStyle = "rgba(0,0,0,0.18)";
        ctx.lineWidth = 1;
        ctx.strokeRect(ox + 0.5, oy + 0.5, tileSide - 1, tileSide - 1);
      }

      // Token placement (inset), leaving label space at bottom
      const tokenX = ox + framePad;
      const tokenY = oy + framePad;
      const maxTokenY = oy + tileSide - framePad - labelH - tokenH;
      const finalTokenY = showIds ? Math.min(tokenY, maxTokenY) : tokenY;

      // Token paper
      ctx.fillStyle = LIGHT;
      ctx.fillRect(tokenX, finalTokenY, tokenW, tokenH);

      const raw = pixelsById[id];
      if (raw) {
        try {
          const parsed = parseNormiesPixelString(raw);
          const reducedAvg = reduceLevels40ToN(parsed.levels, outSize);

          // Threshold in native value space:
          // - binary averages are 0..1
          // - hex averages are 0..15
          const nativeThreshold = parsed.format === "hex" ? threshold01 * 15 : threshold01;

          ctx.fillStyle = DARK;
          for (let y = 0; y < outSize; y++) {
            for (let x = 0; x < outSize; x++) {
              const v = reducedAvg[y * outSize + x];
              if (v < nativeThreshold) continue;
              ctx.fillRect(tokenX + x * scale, finalTokenY + y * scale, scale, scale);
            }
          }
        } catch {
          ctx.fillStyle = DARK;
          ctx.fillRect(
            tokenX,
            finalTokenY,
            Math.max(2, Math.floor(scale / 2)),
            Math.max(2, Math.floor(scale / 2))
          );
        }
      }

      // ID centered UNDER token (inside the square tile)
      if (showIds) {
        const fontSize = Math.max(9, Math.min(13, Math.floor(scale * 0.8)));
        ctx.font = `${fontSize}px var(--pixel-font, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace)`;
        ctx.fillStyle = DARK;
        ctx.textBaseline = "middle";

        const labelYCenter = oy + tileSide - framePad - labelH / 2;
        const text = `#${id}`;

        const m = ctx.measureText(text);
        const tx = ox + tileSide / 2 - m.width / 2;
        ctx.fillText(text, tx, labelYCenter);
      }
    };

    for (let i = 0; i < gridIds.length; i++) drawTile(i, gridIds[i]);
  }, [
    pixelsById,
    gridIds,
    gridSize,
    outSize,
    scale,
    gap,
    border,
    showIds,
    threshold01,
    LIGHT,
    DARK,
  ]);

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `normie-reduction-grid${gridSize}x${gridSize}-${outSize}x${outSize}.png`;
    a.click();
  };

  return (
    <div className="grid h-screen grid-cols-[360px_1fr]">
      <aside className="bg-[#e3e5e4] text-[#48494b] border-r border-black/10 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm leading-tight">REDUCTION</h2>
            <div className="mt-2 text-[10px] opacity-70">
              grid <b>{gridSize}×{gridSize}</b> · 40×40 → <b>{outSize}×{outSize}</b>
            </div>
          </div>

          <button
            onClick={exportPng}
            className="border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
            type="button"
          >
            EXPORT PNG
          </button>
        </div>

        <label className="mt-4 block text-[10px] opacity-80">BASE TOKEN ID (0–9999)</label>
        <input
          value={idInput}
          onChange={(e) => setIdInput(e.target.value)}
          inputMode="numeric"
          className="mt-2 w-full border border-black/20 bg-white/60 px-3 py-2 text-[12px]"
        />

        <div className="mt-3 text-[10px]">
          {status.loading ? <div>LOADING…</div> : null}
          {status.error ? <div className="text-red-700">{status.error}</div> : null}
          <div className="opacity-70">
            Tiles: {gridIds.length} · First: #{gridIds[0] ?? 0}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setNewRandomGrid(gridSize)}
            className="flex-1 border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
            type="button"
          >
            RANDOM
          </button>

          <button
            onClick={() => {
              setOutSize(8);
              setScale(16);
              setGridSize(1);
              setGap(12);
              setBorder(24);
              setShowIds(false);
              setThreshold01(0.5);
              setNewRandomGrid(1);
            }}
            className="border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
            type="button"
          >
            RESET
          </button>
        </div>

        <div className="mt-6">
          <div className="text-[10px] opacity-80">GRID</div>

          <div className="mt-3 flex items-center justify-between">
            <div className="text-[10px] opacity-80">SIZE</div>
            <select
              value={gridSize}
              onChange={(e) => setGridSize(parseInt(e.target.value, 10) as GridSize)}
              className="border border-black/20 bg-white/60 px-2 py-1 text-[10px]"
            >
              {Array.from({ length: 10 }, (_, i) => {
                const n = i + 1;
                return (
                  <option key={n} value={n}>
                    {n}×{n}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="text-[10px] opacity-80">SHOW IDS</div>
            <button
              onClick={() => setShowIds((v) => !v)}
              className="border border-black/20 bg-white/60 px-2 py-1 text-[10px] hover:bg-black/5"
              type="button"
            >
              {showIds ? "on" : "off"}
            </button>
          </div>

          <Slider
            label="OUTPUT SIZE (8–40)"
            value={outSize}
            onChange={setOutSize}
            min={8}
            max={40}
            step={1}
          />

          <Slider label="SCALE" value={scale} onChange={setScale} min={4} max={40} step={1} />

          <SliderFloat
            label="THRESHOLD"
            value={threshold01}
            onChange={setThreshold01}
            min={0}
            max={1}
            step={0.01}
          />

          <Slider label="GAP (px)" value={gap} onChange={setGap} min={0} max={80} step={1} />

          <Slider
            label="BORDER (px)"
            value={border}
            onChange={setBorder}
            min={0}
            max={140}
            step={1}
          />
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
          .pixel-range::-moz-range-thumb {
            width: 14px;
            height: 14px;
            background: #48494b;
            border: 1px solid rgba(0, 0, 0, 0.35);
            border-radius: 0;
            cursor: pointer;
          }

          /* Pixel font hook:
             Set this variable somewhere global if you have a pixel font loaded:
             :root { --pixel-font: "YourPixelFontName"; }
          */
        `}</style>
      </aside>

      <main className="bg-[#e3e5e4] flex items-center justify-center overflow-auto p-6">
        <canvas
          ref={canvasRef}
          className="border border-black/10"
          style={{ imageRendering: "pixelated" as const }}
        />
      </main>
    </div>
  );
}