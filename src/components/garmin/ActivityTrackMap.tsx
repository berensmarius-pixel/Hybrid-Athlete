"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

/**
 * Minimaler Leaflet-Track-Viewer (OSM-Tiles, Cyan-Polyline).
 * Wird via next/dynamic mit ssr:false geladen.
 */
export default function ActivityTrackMap({ points }: { points: [number, number][] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!containerRef.current || points.length < 2) return;
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
        dragging: true,
      });

      const layer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      });
      layer.addTo(map);
      layer.getContainer()?.style.setProperty("filter", "brightness(0.72) contrast(1.08) saturate(0.65)");

      L.polyline(points, { color: "#22d3ee", weight: 3, opacity: 0.9 }).addTo(map);
      map.fitBounds(L.latLngBounds(points), { padding: [16, 16] });
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [points]);

  return <div ref={containerRef} className="h-full w-full" />;
}
