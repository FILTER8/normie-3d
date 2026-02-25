import { NextResponse } from "next/server";

const ALCHEMY_KEY = process.env.ALCHEMY_KEY ?? "";
const ALCHEMY_URL = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;

const NORMIES = "0x9Eb6E2025B64f340691e424b7fe7022fFDE12438";
const ZERO = "0x0000000000000000000000000000000000000000";

type Transfer = {
  hash?: string;
  blockNum?: string; // hex string like "0x..."
  erc721TokenId?: string;
};

type AssetTransfersResult = {
  transfers: Transfer[];
  pageKey?: string;
};

type JsonRpcSuccess<T> = {
  jsonrpc: "2.0";
  id: number;
  result: T;
};

type JsonRpcError = {
  jsonrpc: "2.0";
  id: number;
  error: { code: number; message: string; data?: unknown };
};

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcError;

async function alchemyRpc<T>(method: string, params: unknown[]): Promise<T> {
  const r = await fetch(ALCHEMY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    next: { revalidate: 300 }, // refresh every 5 min
  });

  const text = await r.text();
  if (!r.ok) throw new Error(`Alchemy HTTP ${r.status}: ${text.slice(0, 200)}`);

  let json: JsonRpcResponse<T>;
  try {
    json = JSON.parse(text) as JsonRpcResponse<T>;
  } catch {
    throw new Error(`Alchemy returned non-JSON: ${text.slice(0, 200)}`);
  }

  if ("error" in json) {
    throw new Error(`Alchemy RPC error: ${JSON.stringify(json.error)}`);
  }

  return json.result;
}

export async function GET() {
  if (!ALCHEMY_KEY) {
    return NextResponse.json({ error: "Missing ALCHEMY_KEY" }, { status: 500 });
  }

  const burned: { tokenId: string; txHash?: string; blockNumber?: number }[] =
    [];

  let pageKey: string | undefined = undefined;

  // Fetch burns with pagination
  for (let safety = 0; safety < 50; safety++) {
    // ✅ Explicitly typed response fixes TS7022
    const res: AssetTransfersResult = await alchemyRpc<AssetTransfersResult>(
      "alchemy_getAssetTransfers",
      [
        {
          fromBlock: "0x0",
          toBlock: "latest",
          contractAddresses: [NORMIES],
          category: ["erc721"],
          toAddress: ZERO, // 🔥 burns
          withMetadata: false,
          excludeZeroValue: false,
          maxCount: "0x3e8", // 1000 per page
          pageKey,
        },
      ]
    );

    for (const t of res.transfers ?? []) {
      const tokenId = t.erc721TokenId
        ? BigInt(t.erc721TokenId).toString()
        : undefined;

      if (!tokenId) continue;

      burned.push({
        tokenId,
        txHash: t.hash,
        blockNumber: t.blockNum ? parseInt(t.blockNum, 16) : undefined,
      });
    }

    if (!res.pageKey) break;
    pageKey = res.pageKey;
  }

  // newest first (if blockNumber present)
  burned.sort((a, b) => (b.blockNumber ?? 0) - (a.blockNumber ?? 0));

  return NextResponse.json({ count: burned.length, burns: burned });
}