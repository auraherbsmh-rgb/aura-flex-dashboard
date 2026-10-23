/** Shown the instant "This week's plan" is clicked, while the server reads the plan. */
export default function Loading() {
  return (
    <main className="page" aria-busy="true">
      <div className="slab">
        <div className="band" style={{ minHeight: 168 }}>
          <span className="lbl">Opening this week&apos;s plan…</span>
        </div>
        <div className="body">
          <div className="tray" style={{ minHeight: 240 }} />
        </div>
      </div>
    </main>
  );
}
