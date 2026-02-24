/* ===========================
   app/page.tsx
   NORMIES 3D – Gallery Minimal
   =========================== */
"use client";

export default function Page() {
  return (
    <main className="min-h-screen bg-[#e3e5e4] text-[#48494b] px-8 pt-28 pb-24">
      <div className="max-w-[760px] mx-auto">
        {/* Header */}
        <header className="text-center mb-32">
          <h1 className="text-5xl md:text-7xl tracking-[-0.04em] font-light">
            NORMIES 3D
          </h1>

          <p className="mt-8 text-[11px] uppercase tracking-[0.25em] opacity-70">
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
        <section className="flex flex-col items-center gap-20">
          <div className="w-full max-w-[420px] space-y-16">
            {/* SCULPT */}
            <div className="text-center space-y-5">
              <a
                href="/sculpt"
                className="block border border-black/20 py-5 text-sm tracking-[0.3em] uppercase hover:bg-black/5 transition"
              >
                Sculpt
              </a>
              <p className="text-[11px] opacity-60">
                Sculpt voxels. Export. View in AR.
              </p>
            </div>

            {/* AMBIENT */}
            <div className="text-center space-y-5">
              <a
                href="/ambient"
                className="block border border-black/20 py-5 text-sm tracking-[0.3em] uppercase hover:bg-black/5 transition"
              >
                Ambient
              </a>
              <p className="text-[11px] opacity-60">
                Audio environment by{" "}
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
          </div>
        </section>

        {/* Support */}
        <section className="mt-32 text-center text-[11px] opacity-70">
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
        <div className="mt-6 text-center text-[10px] opacity-50 tracking-wide">
          CC0
        </div>

        {/* Footer */}
        <footer className="mt-32 border-t border-black/10 pt-8 text-[10px] opacity-50">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-center">
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