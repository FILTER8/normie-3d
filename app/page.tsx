/* ===========================
   app/page.tsx
   NORMIES 3D – Gallery Minimal (mobile: one-page fit)
   =========================== */
"use client";

export default function Page() {
  return (
    <main className="min-h-screen bg-[#e3e5e4] text-[#48494b] px-6 sm:px-8 py-10 sm:pt-28 sm:pb-24">
      <div className="max-w-[760px] mx-auto">
        {/* Header */}
        <header className="text-center mb-10 sm:mb-32">
          <h1 className="text-4xl sm:text-5xl md:text-7xl tracking-[-0.04em] font-light leading-none">
            NORMIES 3D
          </h1>

          <p className="mt-4 sm:mt-8 text-[10px] sm:text-[11px] uppercase tracking-[0.22em] sm:tracking-[0.25em] opacity-70">
            Real-time voxel explorer · by{" "}
            <a
              href="https://x.com/0xfilter8"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4 hover:opacity-100"
            >
              0xfilter8
            </a>
          </p>
        </header>

        {/* Actions */}
        <section className="flex flex-col items-center">
          <div className="w-full max-w-[420px] space-y-8 sm:space-y-16">
            {/* SCULPT */}
            <div className="text-center space-y-3 sm:space-y-5">
              <a
                href="/sculpt"
                className="block border border-black/20 py-4 sm:py-5 text-[12px] sm:text-sm tracking-[0.26em] sm:tracking-[0.3em] uppercase hover:bg-black/5 transition"
              >
                Sculpt
              </a>
              <p className="text-[10px] sm:text-[11px] opacity-60">
                Sculpt voxels. Export. View in AR.
              </p>
            </div>

            {/* AMBIENT */}
            <div className="text-center space-y-3 sm:space-y-5">
              <a
                href="/ambient"
                className="block border border-black/20 py-4 sm:py-5 text-[12px] sm:text-sm tracking-[0.26em] sm:tracking-[0.3em] uppercase hover:bg-black/5 transition"
              >
                Ambient
              </a>
              <p className="text-[10px] sm:text-[11px] opacity-60">
                Desktop only. Audio environment by{" "}
                <a
                  href="https://x.com/yasuna_ide"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4"
                >
                  Yasuna Ide
                </a>
              </p>
            </div>
            {/* graveyard */}
            <div className="text-center space-y-3 sm:space-y-5">
              <a
                href="/graveyard"
                className="block border border-black/20 py-4 sm:py-5 text-[12px] sm:text-sm tracking-[0.26em] sm:tracking-[0.3em] uppercase hover:bg-black/5 transition"
              >
                Graveyard
              </a>
              <p className="text-[10px] sm:text-[11px] opacity-60">
                Explore burned tokens
              </p>
            </div>
          </div>
        </section>

        {/* Support */}
        <section className="mt-10 sm:mt-32 text-center text-[10px] sm:text-[11px] opacity-70">
          If this resonates, you can support it here —{" "}
          <a
            href="https://www.normies.art/tools"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            normies.art/tools
          </a>
        </section>

        {/* License */}
        <div className="mt-3 sm:mt-6 text-center text-[12px] tracking-wide">
          CC0
        </div>
 
 {/* Donate */}
<div className="mt-3 sm:mt-6 text-center text-[10px] opacity-50 tracking-wide">
  Donate (ETH):{" "}
  <span className="tabular-nums break-all">
    0x019b0ee245fb09aaf92ac93ca3309832b7974681
  </span>{" "}
  <button
    type="button"
    className="underline ml-2"
    onClick={async () => {
      const addr = "0x019b0ee245fb09aaf92ac93ca3309832b7974681";
      try {
        await navigator.clipboard.writeText(addr);
      } catch {}
    }}
  >
    copy
  </button>
</div>

        {/* Footer */}
        <footer className="mt-10 sm:mt-32 border-t border-black/10 pt-6 sm:pt-8 text-[10px] opacity-50">
          <div className="flex flex-wrap justify-center gap-x-4 sm:gap-x-6 gap-y-2 sm:gap-y-3 text-center">
            <a
              href="https://github.com/FILTER8/normie-3d"
              target="_blank"
              rel="noreferrer"
              className="hover:opacity-80"
            >
              Github
            </a>
            <a
              href="https://x.com/0xfilter8"
              target="_blank"
              rel="noreferrer"
              className="hover:opacity-80"
            >
              0xfilter8
            </a>
            <a
              href="https://x.com/yasuna_ide"
              target="_blank"
              rel="noreferrer"
              className="hover:opacity-80"
            >
              Yasuna Ide
            </a>
            <a
              href="https://www.normies.art"
              target="_blank"
              rel="noreferrer"
              className="hover:opacity-80"
            >
              Normies
            </a>
            <a
              href="https://api.normies.art"
              target="_blank"
              rel="noreferrer"
              className="hover:opacity-80"
            >
              API
            </a>
            <a
              href="https://x.com/normiesART"
              target="_blank"
              rel="noreferrer"
              className="hover:opacity-80"
            >
              X
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}