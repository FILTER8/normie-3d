# 🟦 Normie 3D

**A real-time voxel sculpture explorer for Normies.**  
Built with Next.js · React Three Fiber · Three.js

Transform 2D pixel art into an interactive 3D universe — now with a dedicated **Ambient** mode.

---

## ✨ What Is This?

Normie 3D takes the original 40×40 pixel data from Normies and converts it into:

- A sculptural voxel statue  
- A procedural depth system  
- A dynamic "universe" scatter mode  
- **NEW: Ambient mode (trait-driven studio + audio-reactive starfield)**  
- An AR-ready export (USDZ)

Designed to feel minimal, smooth, and tactile.

---

## 🎮 Live Interaction

### 🧊 3D Voxel Sculpture ( /sculpt )

Each pixel becomes a 3D voxel block.

- 8 procedural grouping layers  
- Adjustable depth per group  
- Adjustable extrusion thickness  
- Noise-based blob grouping  

---

### 🌌 Universe Mode

Morph the sculpture into space.

- Smooth statue ↔ starfield transition  
- Procedural spherical distribution  
- Adjustable grouping scale  
- Fully animated return to statue mode  

---

### 🎤 Audio Reactive Mode (Mic / Sculpt)

Turn on the mic and let the sculpture breathe.

- Real-time microphone input  
- Fast expansion, slow cinematic collapse  
- Noise gating + smoothing  
- Elegant drift back to structure  

Optional — manual control remains available.

---

## 🌙 Ambient Mode ( /ambient )

A dedicated ambient page built for “set and forget” viewing.

Trait-driven studio + audio-reactive starfield, where the look & motion derive from the token’s traits.

**Features**
- Trait-derived studio presets (lighting / material / motion / starfield balance)  
- AUDIO ON/OFF  
- Volume + Intensity controls  
- AUTO ID mode (cycles tokens every 40s) + countdown  
- Fullscreen friendly presentation  

**Audio**
- Ambient audio by **Yasuna Ide**: https://x.com/yasuna_ide  

---

### 🎨 Materials & Lighting

**Material Modes**
- Matte  
- Gloss  
- Chrome  
- Glow  
- Pastel (per-group coloring)

**Lighting Presets**
- Studio  
- Top  
- Rim  
- Flat  
- Drama

Instant switching, no reload.

---

### 🔄 Rotation Modes

Cycles through:

OFF → SMOOTH → MIDDLE → FAST → OFF

Fully adjustable speeds in code.

---

### 🔁 Smooth Reset System

Reset isn't a snap — it's a performance.

- Camera rotates back to front view  
- Starfield gathers inward  
- Depth collapses to zero  
- Extrusion returns to 1 block  
- Cubic easing throughout  

Triggered by button or long press.

---

### 📦 Export

- PNG export with subtle pixel stamp  
- High DPI support  
- Mobile-safe rendering  
- Fullscreen capture  

---

### 📱 AR (iPhone)

- USDZ export endpoint  
- Apple Quick Look compatible  
- Clean statue mode for AR stability  

Launch directly into augmented reality.

---

## ⚡ Performance

Built for smoothness:

- Three.js InstancedMesh rendering  
- Zero per-frame geometry allocation  
- Proper material disposal  
- Stable React hook usage  
- Optimized audio loop  
- Runs smoothly on mid-range laptops  

---

## 🖥 Controls

### Keyboard (Sculpt)

| Key | Action |
| --- | --- |
| S | Save PNG |
| R | Cycle rotation mode |
| F | Fullscreen |
| B | Random blob size |
| L | Cycle lighting |
| M | Cycle material |
| C | Chaos mode |
| ← / → | Previous / next token |

### Keyboard (Ambient)

| Key | Action |
| --- | --- |
| A | Audio on/off |
| F | Fullscreen |
| ← / → | Previous / next token |

---

### Mobile Gestures (Sculpt)

- Swipe left / right → Previous / next token  
- Double tap → Randomize depth  
- Long press → Smooth reset  

---

## 🛠 Tech Stack

- Next.js (App Router)  
- React  
- React Three Fiber  
- Three.js  
- Drei  
- USDZExporter  
- Web Audio API  

---

## 🧬 Credits

This project uses public Normies endpoints + metadata.

- Normies: https://www.normies.art  
- Normies API: https://api.normies.art  
- Normies X: https://x.com/normiesART  
- Art by SercOne: https://x.com/serc1n  
- API credit: https://x.com/YigitDuman  
- Ambient audio by Yasuna Ide https://x.com/yasuna_ide  

**Made by 0xfilter**  
https://x.com/0xfilter8  

---

## 🚀 Run Locally

```bash
git clone https://github.com/FILTER8/normie-3d.git
cd normie-3d
npm install
npm run dev
```

Open:

http://localhost:3000

---

## 📜 License

Free to use.  
Fork it. Remix it. Build on it.

Attribution appreciated.
