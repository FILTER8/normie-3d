export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params; // Next 15
  const id = Number.parseInt(idStr, 10);

  if (!Number.isFinite(id) || id < 0 || id > 9999) {
    return Response.json({ error: "Invalid token id (0–9999)" }, { status: 400 });
  }

  const url = new URL(req.url);
  // mode=canvas (default) OR mode=original
  const mode = (url.searchParams.get("mode") ?? "canvas").toLowerCase();

  const path =
    mode === "original"
      ? `/normie/${id}/original/pixels`
      : `/normie/${id}/pixels`;

  const upstream = await fetch(`https://api.normies.art${path}`, {
    next: { revalidate: 60 },
  });

  const text = (await upstream.text()).trim();

  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-upstream-ratelimit-remaining": upstream.headers.get("X-RateLimit-Remaining") ?? "",
    },
  });
}