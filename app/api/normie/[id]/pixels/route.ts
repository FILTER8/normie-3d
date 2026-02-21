export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params; // <-- IMPORTANT in Next 15
  const id = Number.parseInt(idStr, 10);

  if (!Number.isFinite(id) || id < 0 || id > 9999) {
    return Response.json({ error: "Invalid token id (0–9999)" }, { status: 400 });
  }

  const upstream = await fetch(`https://api.normies.art/normie/${id}/pixels`, {
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