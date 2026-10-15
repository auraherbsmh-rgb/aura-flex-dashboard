/** Shown the instant a tab is clicked, while the server prepares the screen. Same slab and band, no fake content. */
export default function Loading() {
  return (
    <main className="page" aria-busy="true">
      <div className="slab">
        <div className="band" style={{ minHeight: 168 }}>
          <span className="lbl">Loading…</span>
        </div>
        <div className="body">
          <div className="tray" style={{ minHeight: 160 }} />
        </div>
      </div>
    </main>
  );
}
