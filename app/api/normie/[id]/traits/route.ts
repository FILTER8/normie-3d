export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number.parseInt(idStr, 10);

  if (!Number.isFinite(id) || id < 0 || id > 9999) {
    return Response.json({ error: "Invalid token id (0–9999)" }, { status: 400 });
  }

  const upstream = await fetch(`https://api.normies.art/normie/${id}/traits`, {
    next: { revalidate: 300 },
  });

  const data = await upstream.json();
  return Response.json(data, { status: upstream.status });
}