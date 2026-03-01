export type PixelMode = "canvas" | "original";

export async function fetchPixels(id: number, mode: PixelMode = "canvas") {
  const qs = mode === "original" ? "?mode=original" : "";
  const res = await fetch(`/api/normie/${id}/pixels${qs}`);
  if (!res.ok) throw new Error(`Pixels failed (${res.status})`);
  const t = (await res.text()).trim();
  if (t.length !== 1600) throw new Error(`Unexpected pixel length: ${t.length}`);
  return t;
}

export async function fetchTraits(id: number) {
  const res = await fetch(`/api/normie/${id}/traits`);
  if (!res.ok) throw new Error(`Traits failed (${res.status})`);
  return res.json();
}