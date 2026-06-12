import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const panelRoot = path.dirname(fileURLToPath(import.meta.url));
const API_ORIGIN = process.env.PANEL_API_ORIGIN || "http://127.0.0.1:3000";

const nextConfig: NextConfig = {
  turbopack: {
    root: panelRoot,
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
