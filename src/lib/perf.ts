// Server-side timing lines for Vercel logs ("[perf] copywriting · data 1 · 312 ms"). Read-only diagnostics.
export function perf(page: string) {
  const t0 = performance.now();
  let last = t0;
  return (step: string) => {
    const now = performance.now();
    console.log(`[perf] ${page} · ${step} · ${Math.round(now - last)} ms (total ${Math.round(now - t0)} ms)`);
    last = now;
  };
}
