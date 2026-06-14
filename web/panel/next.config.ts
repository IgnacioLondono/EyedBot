import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const panelRoot = path.dirname(fileURLToPath(import.meta.url));
const API_ORIGIN = process.env.PANEL_API_ORIGIN || "http://127.0.0.1:3000";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  productionBrowserSourceMaps: false,
  turbopack: {
    root: panelRoot,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/eyedbot-icon.svg",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
    ];
  },
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      { source: "/auth/discord", destination: `${API_ORIGIN}/auth/discord` },
      { source: "/callback", destination: `${API_ORIGIN}/callback` },
      { source: "/logout", destination: `${API_ORIGIN}/logout` },
    ];
  },
};

export default nextConfig;
