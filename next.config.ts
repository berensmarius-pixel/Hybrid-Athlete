import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  reactStrictMode: true,
  poweredByHeader: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "@zxing/library"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Uploads/State-Antworten sollen niemals als HTML/JS interpretiert werden
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Referrer nicht an externe Dienste (Nominatim, OSRM, Strava) leaken
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // App ist keine Framing-Ziel
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(self)",
          },
        ],
      },
      {
        // Chat-Bilder & Datei-Auslieferung besonders hart absichern
        source: "/api/files/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Security-Policy", value: "default-src 'none'; sandbox" },
        ],
      },
    ];
  },
};

export default nextConfig;
