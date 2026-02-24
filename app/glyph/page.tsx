/* ===========================
   app/glyph/page.tsx (NO 3D)
   Normies pixels (1600 chars = 40x40) -> 8x8 glyph tiles
   Glyphs loaded from /public/glyphs.json

   TWO-TONE ONLY:
   - LIGHT (background gray)
   - DARK (ink)

   Modes (only ONE side gets glyphs):
   1) Glyphs on NORMIE, background is flat
   2) Glyphs on BACKGROUND, normie is flat

   Invert = swap base/ink colors inside glyph tiles (still ONLY 2 colors)
   Glyph subset = deterministic RANDOM subset (size 1..40) from glyphs

   Negative-space region flips (still ONLY 2 colors)
   - Split into 20x20 / 10x10 / 5x5 regions (or MIX)
   - Randomly flip palette per region (density-controlled)
   - NEW: grid can affect background, background+border, or all
   =========================== */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPixels, fetchTraits } from "../lib/normiesApi";

type Trait = { trait_type: string; value: string | number | boolean | null };
type TraitsResponse = { attributes?: Trait[] };

function clampId(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(9999, n));
}

function errMessage(e: unknown, fallback: string) {
  if (e instanceof Error) return e.message || fallback;
  if (typeof e === "string") return e || fallback;
  return fallback;
}

/** Parse 0x... 64-bit glyph into 8 rows of 8 bits */
function parseGlyph(hex: string): number[][] {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const v = BigInt("0x" + clean);

  const rows: number[][] = [];
  for (let row = 0; row < 8; row++) {
    const shift = BigInt((7 - row) * 8);
    const byte = Number((v >> shift) & BigInt(0xff));
    const bits = Array.from({ length: 8 }, (_, col) => (byte >> (7 - col)) & 1);
    rows.push(bits);
  }
  return rows;
}

/** Normies pixels are a 1600-char string => 40x40, each char hex 0..f */
function parseNormiesPixelString(raw: string): { w: number; h: number; levels: number[] } {
  const s = raw.trim();
  if (s.length !== 1600) throw new Error(`Unexpected pixel length: ${s.length} (expected 1600)`);

  const w = 40;
  const h = 40;
  const levels = new Array<number>(1600);

  for (let i = 0; i < 1600; i++) {
    const c = s[i];
    const v = parseInt(c, 16);
    if (Number.isNaN(v)) {
      throw new Error(`Bad pixel char "${c}" at index ${i}. Expected hex 0-9/a-f.`);
    }
    levels[i] = v; // 0..15
  }

  return { w, h, levels };
}

/** Fast deterministic hash -> uint32 */
function hashU32(x: number, y: number, seed: number) {
  let n = (x * 73856093) ^ (y * 19349663) ^ (seed * 83492791);
  n >>>= 0;

  n ^= n >>> 16;
  n = Math.imul(n, 0x7feb352d) >>> 0;
  n ^= n >>> 15;
  n = Math.imul(n, 0x846ca68b) >>> 0;
  n ^= n >>> 16;

  return n >>> 0;
}

/** Deterministically pick a "random" subset of size n from [0..total-1] */
function makeGlyphPool(total: number, n: number, seed: number): number[] {
  const nn = Math.max(1, Math.min(n, total));
  const idx = Array.from({ length: total }, (_, i) => i);

  // Partial Fisher–Yates: only shuffle the first nn positions
  for (let i = 0; i < nn; i++) {
    const r = hashU32(i, 999, seed);
    const j = i + (r % (total - i));
    const tmp = idx[i];
    idx[i] = idx[j];
    idx[j] = tmp;
  }

  return idx.slice(0, nn);
}

/** UI slider */
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

type GlyphPlacement = "normie" | "background";
type SplitMode = "20" | "10" | "5" | "mix";
type GridAffects = "bg" | "bg+border" | "all";

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [idInput, setIdInput] = useState("0");
  const id = useMemo(() => clampId(parseInt(idInput, 10)), [idInput]);

  const [pixels, setPixels] = useState<string | null>(null);
  const [traits, setTraits] = useState<TraitsResponse | null>(null);
  const [status, setStatus] = useState({ loading: false, error: "" });

  const [glyphHex, setGlyphHex] = useState<string[] | null>(null);
  const [glyphs, setGlyphs] = useState<number[][][] | null>(null);

  // Render controls
  const [scale, setScale] = useState(3);
  const [seed, setSeed] = useState(1);

  // Two modes: glyphs only on one side
  const [glyphPlacement, setGlyphPlacement] = useState<GlyphPlacement>("normie");

  // Two-tone invert: swaps base/ink inside glyph tiles (still only 2 colors)
  const [invertGlyphs, setInvertGlyphs] = useState(false);

  // Limit subset size (1..40) - used as random pool size
  const [glyphLimitUI, setGlyphLimitUI] = useState(40);

  // Negative-space region flips
  const [regionFlipEnabled, setRegionFlipEnabled] = useState(true);
  const [splitMode, setSplitMode] = useState<SplitMode>("mix");
  const [flipDensity, setFlipDensity] = useState(45); // % chance a region flips

  // NEW: where grid inversion applies
  const [gridAffects, setGridAffects] = useState<GridAffects>("bg+border");

  // ONLY TWO COLORS
  const LIGHT = "#e3e5e4";
  const DARK = "#48494b";

  // Load glyphs once (public/glyphs.json)
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/glyphs.json", { cache: "force-cache" });
        if (!res.ok) throw new Error(`Failed to load /glyphs.json (${res.status})`);
        const arr = (await res.json()) as string[];
        if (cancelled) return;

        setGlyphHex(arr);
        setGlyphs(arr.map(parseGlyph));
      } catch (e: unknown) {
        if (cancelled) return;
        setStatus((s) => ({ ...s, error: errMessage(e, "Failed to load glyphs") }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load pixels + traits per token id
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
        setStatus({ loading: false, error: errMessage(e, "Unknown error") });
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [id]);

  // Draw
  useEffect(() => {
    if (!pixels || !glyphs || glyphs.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let parsed: { w: number; h: number; levels: number[] };
    try {
      parsed = parseNormiesPixelString(pixels);
    } catch (e: unknown) {
      setStatus((s) => ({ ...s, error: errMessage(e, "Pixel parse error") }));
      return;
    }

    const { w, h, levels } = parsed;

    const outW = w * 8 * scale;
    const outH = h * 8 * scale;
    canvas.width = outW;
    canvas.height = outH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    // Fill whole canvas LIGHT
    ctx.fillStyle = LIGHT;
    ctx.fillRect(0, 0, outW, outH);

    // Effective glyph subset size (1..40..glyphs.length)
    const totalGlyphs = glyphs.length;
    const subsetSize = Math.max(1, Math.min(glyphLimitUI, Math.min(40, totalGlyphs)));

    // Deterministic random pool
    const poolSeed =
      seed * 1315423911 +
      subsetSize * 2654435761 +
      (glyphPlacement === "normie" ? 17 : 23) +
      (invertGlyphs ? 101 : 0);

    const glyphPool = makeGlyphPool(totalGlyphs, subsetSize, poolSeed);
    const poolLen = glyphPool.length;

    // Region split sizes
    const splitSizes: number[] = splitMode === "mix" ? [20, 10, 5] : [parseInt(splitMode, 10)];
    const density01 = Math.max(0, Math.min(100, flipDensity)) / 100;

    const idxAt = (x: number, y: number) => y * w + x;
    const isBgAt = (x: number, y: number) => levels[idxAt(x, y)] === 0;

    const isBorderPixel = (x: number, y: number, isBg: boolean) => {
      if (isBg) return false; // border refers to silhouette edge
      // 4-neighborhood
      if (x > 0 && isBgAt(x - 1, y)) return true;
      if (x < w - 1 && isBgAt(x + 1, y)) return true;
      if (y > 0 && isBgAt(x, y - 1)) return true;
      if (y < h - 1 && isBgAt(x, y + 1)) return true;
      return false;
    };

    const shouldGridAffect = (isBg: boolean, isBorder: boolean) => {
      if (!regionFlipEnabled) return false;
      if (gridAffects === "all") return true;
      if (gridAffects === "bg") return isBg;
      // bg+border
      return isBg || isBorder;
    };

    // Region flip decision (deterministic)
    const regionFlipAt = (px: number, py: number) => {
      let flip = false;
      for (const s of splitSizes) {
        const rx = Math.floor(px / s);
        const ry = Math.floor(py / s);
        const r = hashU32(rx, ry, seed * 1009 + s * 9176 + 1337);
        const u = (r >>> 0) / 0xffffffff;
        const layerFlip = u < density01;
        flip = flip !== layerFlip; // XOR layers
      }
      return flip;
    };

    // Default base/ink inside glyph tiles (2-tone invert)
    const defaultGlyphInk = invertGlyphs ? LIGHT : DARK;
    const defaultGlyphBase = invertGlyphs ? DARK : LIGHT;

    const fillTile = (px: number, py: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(px * 8 * scale, py * 8 * scale, 8 * scale, 8 * scale);
    };

    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const i = py * w + px;
        const isBg = levels[i] === 0;
        const isBorder = isBorderPixel(px, py, isBg);

        // Apply grid inversion only where requested
        const applyGridHere = shouldGridAffect(isBg, isBorder);
        const flip = applyGridHere ? regionFlipAt(px, py) : false;

        // Local palette (still only two colors)
        const localLIGHT = flip ? DARK : LIGHT;
        const localDARK = flip ? LIGHT : DARK;

        // Which side gets glyphs
        const isGlyphSide = glyphPlacement === "normie" ? !isBg : isBg;

        // --- Non-glyph side ---
        if (!isGlyphSide) {
          if (glyphPlacement === "background" && !isBg) {
            // normie side is flat DARK (but still can be locally flipped if affects=all)
            fillTile(px, py, localDARK);
          } else {
            // background side: ensure it matches localLIGHT (if localLIGHT==DARK we must paint it)
            if (localLIGHT === DARK) fillTile(px, py, localLIGHT);
          }
          continue;
        }

        // --- Glyph side ---
        // Local glyph base/ink based on invert but using local palette
        const glyphInk = defaultGlyphInk === LIGHT ? localLIGHT : localDARK;
        const glyphBase = defaultGlyphBase === LIGHT ? localLIGHT : localDARK;

        // Always paint base so it can participate in the checker grid too
        fillTile(px, py, glyphBase);

        // Pick glyph from pool
        const rPick = hashU32(px, py, seed);
        const poolPick = glyphPool[rPick % poolLen];
        const glyph = glyphs[poolPick];

        // Draw glyph bits
        ctx.fillStyle = glyphInk;
        for (let gy = 0; gy < 8; gy++) {
          for (let gx = 0; gx < 8; gx++) {
            if (!glyph[gy][gx]) continue;
            ctx.fillRect((px * 8 + gx) * scale, (py * 8 + gy) * scale, scale, scale);
          }
        }
      }
    }
  }, [
    pixels,
    glyphs,
    scale,
    seed,
    glyphPlacement,
    invertGlyphs,
    glyphLimitUI,
    regionFlipEnabled,
    splitMode,
    flipDensity,
    gridAffects,
    LIGHT,
    DARK,
  ]);

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `normie-glyph-${id}-${glyphPlacement}-seed${seed}.png`;
    a.click();
  };

  const glyphsLoadedCount = glyphHex?.length ?? 0;
  const subsetEffective = Math.max(
    1,
    Math.min(glyphLimitUI, Math.min(40, glyphsLoadedCount || 40))
  );

  const traitList: Trait[] = traits?.attributes ?? [];

  return (
    <div className="grid h-screen grid-cols-[380px_1fr]">
      <aside className="bg-[#e3e5e4] text-[#48494b] border-r border-black/10 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm leading-tight">NORMIES GLYPH</h2>
            <div className="mt-2 text-[10px] opacity-70">
              Two-tone · glyphs on <b>{glyphPlacement.toUpperCase()}</b> · subset{" "}
              <span className="tabular-nums">{subsetEffective}</span> · grid affects{" "}
              <b>{gridAffects}</b>
            </div>
          </div>

          <button
            onClick={() => setSeed((s) => s + 1)}
            className="border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
            type="button"
          >
            REROLL
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
          {status.loading ? <div>LOADING…</div> : null}
          {status.error ? <div className="text-red-700">{status.error}</div> : null}
          {!glyphHex && !status.error ? <div>Loading glyphs…</div> : null}
          {glyphHex ? <div>Glyphs loaded: {glyphHex.length}</div> : null}
          {pixels ? <div>Pixels loaded: {pixels.length} chars</div> : null}
          <div className="opacity-70">Seed: {seed}</div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={exportPng}
            className="flex-1 border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
            type="button"
          >
            EXPORT PNG
          </button>
          <button
            onClick={() => {
              setScale(3);
              setSeed(1);
              setGlyphPlacement("normie");
              setInvertGlyphs(false);
              setGlyphLimitUI(40);
              setRegionFlipEnabled(true);
              setSplitMode("mix");
              setFlipDensity(45);
              setGridAffects("bg+border");
            }}
            className="border border-black/20 px-3 py-2 text-[10px] hover:bg-black/5"
            type="button"
          >
            RESET
          </button>
        </div>

        <div className="mt-6">
          <div className="text-[10px] opacity-80">MODE</div>

          <div className="mt-3 flex items-center justify-between">
            <div className="text-[10px] opacity-80">GLYPHS ON</div>
            <select
              value={glyphPlacement}
              onChange={(e) => setGlyphPlacement(e.target.value as GlyphPlacement)}
              className="border border-black/20 bg-white/60 px-2 py-1 text-[10px]"
            >
              <option value="normie">normie</option>
              <option value="background">background</option>
            </select>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="text-[10px] opacity-80">INVERT</div>
            <label className="flex items-center gap-2 text-[10px]">
              <input
                type="checkbox"
                checked={invertGlyphs}
                onChange={(e) => setInvertGlyphs(e.target.checked)}
              />
              <span className="opacity-80">{invertGlyphs ? "on" : "off"}</span>
            </label>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="text-[10px] opacity-80">NEGATIVE SPACE GRID</div>
            <label className="flex items-center gap-2 text-[10px]">
              <input
                type="checkbox"
                checked={regionFlipEnabled}
                onChange={(e) => setRegionFlipEnabled(e.target.checked)}
              />
              <span className="opacity-80">{regionFlipEnabled ? "on" : "off"}</span>
            </label>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="text-[10px] opacity-80">GRID AFFECTS</div>
            <select
              value={gridAffects}
              onChange={(e) => setGridAffects(e.target.value as GridAffects)}
              className="border border-black/20 bg-white/60 px-2 py-1 text-[10px]"
              disabled={!regionFlipEnabled}
            >
              <option value="bg">background only</option>
              <option value="bg+border">background + border</option>
              <option value="all">all tiles</option>
            </select>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="text-[10px] opacity-80">SPLIT MODE</div>
            <select
              value={splitMode}
              onChange={(e) => setSplitMode(e.target.value as SplitMode)}
              className="border border-black/20 bg-white/60 px-2 py-1 text-[10px]"
              disabled={!regionFlipEnabled}
            >
              <option value="20">20x20 (4 blocks)</option>
              <option value="10">10x10</option>
              <option value="5">5x5</option>
              <option value="mix">MIX (20+10+5)</option>
            </select>
          </div>

          <Slider label="SCALE" value={scale} onChange={setScale} min={1} max={10} step={1} />
          <Slider label="SEED" value={seed} onChange={setSeed} min={1} max={9999} step={1} />
          <Slider
            label="GLYPH SUBSET (1–40)"
            value={glyphLimitUI}
            onChange={setGlyphLimitUI}
            min={1}
            max={40}
            step={1}
          />
          <Slider
            label="FLIP DENSITY (%)"
            value={flipDensity}
            onChange={setFlipDensity}
            min={0}
            max={100}
            step={1}
          />
        </div>

        <div className="mt-8">
          <div className="text-[10px] opacity-80">TRAITS</div>
          {traitList.length === 0 ? (
            <div className="mt-2 text-[10px] opacity-60">—</div>
          ) : (
            <ul className="mt-2 space-y-1 text-[10px]">
              {traitList.map((a, i) => (
                <li key={`${a.trait_type}-${i}`}>
                  <span className="opacity-70">{a.trait_type}:</span> {String(a.value)}
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
          .pixel-range::-moz-range-thumb {
            width: 14px;
            height: 14px;
            background: #48494b;
            border: 1px solid rgba(0, 0, 0, 0.35);
            border-radius: 0;
            cursor: pointer;
          }
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