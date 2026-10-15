import type { NextConfig } from "next";

// Every screen is per-person and read at request time (roles, live data), so the
// prerendered-shell model (cacheComponents) is off: pages render on each request.
const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;
