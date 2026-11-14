import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  // Keep disposable integration builds separate from the developer's running app.
  distDir: process.env.PAWTRACK_INTEGRATION_TEST === "1" ? ".next-integration" : ".next",
  turbopack: { root: process.cwd() },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
    ] }, {
      // Global headers otherwise override the callback's more restrictive policy.
      source: "/auth/:path*", headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Cache-Control", value: "private, no-store" },
      ],
    }, {
      source: "/api/:path*", headers: [
        { key: "Cache-Control", value: "private, no-store" },
        { key: "Referrer-Policy", value: "no-referrer" },
      ],
    }];
  },
};
export default config;
