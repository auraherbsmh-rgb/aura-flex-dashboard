"use client";

/** Shown when a screen could not load (e.g. the database did not answer). Nothing was changed. */
export default function ScreenError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page">
      <div className="slab">
        <div className="body" style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
          <h1 className="h1">Could not load this page</h1>
          <div className="notice notice-red" role="alert">The database did not answer. Nothing was changed. Try again in a moment.</div>
          <button type="button" className="btn b-primary" onClick={() => reset()}>Try again</button>
        </div>
      </div>
    </main>
  );
}
