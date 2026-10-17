// Server only: read-only calls to the Shipper Open API (docs: shipper.network/tn/en/documentation/api).
export const SHIPPER_BASE = "https://server.shipper.network/api/v1";

export type ShipperCall = { path: string; status: number; ms: number; body: unknown; error: string | null };

/** One GET with the key from Vercel (SHIPPER_API_KEY). Never writes. */
export async function shipperGet(path: string): Promise<ShipperCall> {
  const key = process.env.SHIPPER_API_KEY;
  if (!key) return { path, status: 0, ms: 0, body: null, error: "SHIPPER_API_KEY is not set in Vercel." };
  const t0 = Date.now();
  try {
    const res = await fetch(`${SHIPPER_BASE}${path}`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, cache: "no-store" });
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* not JSON: keep the text */ }
    return { path, status: res.status, ms: Date.now() - t0, body, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (e) {
    return { path, status: 0, ms: Date.now() - t0, body: null, error: e instanceof Error ? e.message.replace(key, "…") : "Request failed" };
  }
}

const PERSONAL = /^(first_name|last_name|name|phone\d*|email|address\d*|division_\d|zip|postal_code|city|street|full_name|customer|customer_name)$/i;

/** Hides people's names, phones and addresses anywhere inside an `address` object or customer fields; keeps product names. */
export function redact(v: unknown, inPerson = false): unknown {
  if (Array.isArray(v)) return v.map((x) => redact(x, inPerson));
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => {
      const person = inPerson || /^(address|customer|shipping_address|billing_address|recipient)$/i.test(k);
      if (person && PERSONAL.test(k)) return [k, x === null || x === "" ? x : "•••"];
      if (/^(phone\d*|email)$/i.test(k)) return [k, x === null || x === "" ? x : "•••"];
      return [k, redact(x, person)];
    }));
  }
  return v;
}
