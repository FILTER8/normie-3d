"use client";

import { useEffect, useState } from "react";
import { GraveyardScene, type Burn } from "../components/graveyard/GraveyardScene";

export default function GraveyardPage() {
  const [burns, setBurns] = useState<Burn[]>([]);
  const [err, setErr] = useState("");

useEffect(() => {
  let cancelled = false;

  type BurnApiResponse = {
    burns?: {
      tokenId?: string | number;
      blockNumber?: string | number;
      txHash?: string;
    }[];
  };

  (async () => {
    try {
      const r = await fetch("/api/burns", { cache: "no-store" });
      const j: BurnApiResponse = await r.json();
      if (cancelled) return;

      const list: Burn[] = (j.burns ?? []).map((b) => ({
        tokenId: String(b.tokenId),
        blockNumber: Number(b.blockNumber ?? 0),
        txHash: String(b.txHash ?? ""),
      }));

      setBurns(list);
    } catch (e: unknown) {
      if (cancelled) return;

      if (e instanceof Error) {
        setErr(e.message);
      } else {
        setErr("Failed to load burns");
      }
    }
  })();

  return () => {
    cancelled = true;
  };
}, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#1c1c1e]">
<div className="absolute left-4 top-4 z-10 select-none">
  <div className="text-[10px] tracking-widest text-[#d0d0d0]">
    BURNS: {burns.length.toLocaleString()}
    {err ? <span className="ml-3 opacity-70">({err})</span> : null}
  </div>

  <div className="mt-2 text-[10px] leading-4 text-[#bdbdbd]/80 tracking-wide">
    THE NORMIES GRAVEYARD 
  </div>
</div>
      <GraveyardScene burns={burns} />
    </div>
  );
}