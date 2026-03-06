import { NextResponse } from "next/server";

const NORMIES_API = "https://api.normies.art";

type BurnedTokenApiItem = {
  tokenId: string;
  commitId?: string;
  owner?: string;
  receiverTokenId?: string;
  pixelCount?: number | string;
  blockNumber?: string;
  timestamp?: string;
  txHash?: string;
};

type Burn = {
  tokenId: string;
  txHash?: string;
  blockNumber?: number;
  timestamp?: number;
  commitId?: string;
  owner?: string;
  receiverTokenId?: string;
  pixelCount?: number;
};

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 300 },
  });

  const text = await r.text();

  if (!r.ok) {
    throw new Error(`HTTP ${r.status} for ${url}: ${text.slice(0, 300)}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Non-JSON from ${url}: ${text.slice(0, 300)}`);
  }
}

function toNum(v?: string | number): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET() {
  try {
    const limit = 100; // docs say max 100 per page
    let offset = 0;

    const burns: Burn[] = [];
    const seen = new Set<string>();

    for (let safety = 0; safety < 200; safety++) {
      const url = `${NORMIES_API}/history/burned-tokens?limit=${limit}&offset=${offset}`;
      const page = await fetchJson<BurnedTokenApiItem[]>(url);

      if (!Array.isArray(page) || page.length === 0) break;

      for (const item of page) {
        if (!item?.tokenId) continue;
        if (seen.has(item.tokenId)) continue;
        seen.add(item.tokenId);

        burns.push({
          tokenId: item.tokenId,
          txHash: item.txHash,
          blockNumber: toNum(item.blockNumber),
          timestamp: toNum(item.timestamp),
          commitId: item.commitId,
          owner: item.owner,
          receiverTokenId: item.receiverTokenId,
          pixelCount: toNum(item.pixelCount),
        });
      }

      if (page.length < limit) break;
      offset += limit;
    }

    burns.sort((a, b) => {
      const byBlock = (b.blockNumber ?? 0) - (a.blockNumber ?? 0);
      if (byBlock !== 0) return byBlock;
      return (b.timestamp ?? 0) - (a.timestamp ?? 0);
    });

    return NextResponse.json({
      count: burns.length,
      burns,
    });
  } catch (error) {
    console.error("Failed to fetch burn history:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}