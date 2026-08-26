import type { MetadataRoute } from "next";

/**
 * Web App Manifest (PWA) – wird von Next.js als Route /manifest.webmanifest
 * ausgeliefert und via <link rel="manifest"> automatisch injiziert.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hybrid Athlete - KI Coach & Ernährung",
    short_name: "HybridAthlete",
    description:
      "Ganzheitlicher KI Hybrid-Coach für Training, Erholung & Ernährung",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#09090b",
    theme_color: "#09090b",
    orientation: "portrait",
    categories: ["health", "fitness", "sports"],
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Workout starten",
        short_name: "Training",
        description: "Aktive Session aus dem Wochenplan starten",
        url: "/?view=training",
      },
      {
        name: "Gewicht eintragen",
        short_name: "Gewicht",
        description: "Körpergewicht & Zusammensetzung loggen",
        url: "/?view=dashboard",
      },
    ],
  };
}
