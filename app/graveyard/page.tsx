"use client";

import { useEffect, useState } from "react";
import { GraveyardScene, type Burn } from "../components/graveyard/GraveyardScene";

type BurnsApiBurn = {
  tokenId: unknown;
  blockNumber?: unknown;
  txHash?: unknown;
};

type BurnsApiResponse = {
  count?: unknown;
  burns?: BurnsApiBurn[];
  error?: unknown;
};

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "Failed to load burns";
  }
}

export default function GraveyardPage() {
  const [burns, setBurns] = useState<Burn[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const r = await fetch("/api/burns", { cache: "no-store" });
        const j: BurnsApiResponse = await r.json();
        if (cancelled) return;

        if (!r.ok) {
          const msg =
            typeof j?.error === "string" ? j.error : `Request failed (${r.status})`;
          setErr(msg);
          return;
        }

        const list: Burn[] = (j?.burns ?? []).map((b) => ({
          tokenId: String(b.tokenId ?? ""),
          blockNumber:
            typeof b.blockNumber === "number"
              ? b.blockNumber
              : Number(b.blockNumber ?? 0),
          txHash: String(b.txHash ?? ""),
        }));

        setBurns(list);
        setErr("");
      } catch (e: unknown) {
        if (cancelled) return;
        setErr(getErrorMessage(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#1c1c1e]">
      <div className="absolute left-4 top-4 z-10 select-none">
             <div className="mt-2 text-[10px] leading-4 text-[#bdbdbd] tracking-wide">
      THE GRAVEYARD
             </div>
        <div className="text-[10px] tracking-widest text-[#d0d0d0]">
          BURNED: {burns.length.toLocaleString()}
          {err ? <span className="ml-3 opacity-70">({err})</span> : null}
        </div>


      </div>

      <GraveyardScene burns={burns} />
    </div>
  );
}