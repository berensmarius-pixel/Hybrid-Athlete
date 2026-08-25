"use client";

/**
 * Letzte Auffanglinie: fängt Fehler im Root-Layout ab.
 * Muss selbst <html>/<body> rendern.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="de">
      <body
        style={{
          background: "#09090b",
          color: "#f4f4f5",
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          margin: 0,
          padding: "1rem",
        }}
      >
        <div
          style={{
            maxWidth: "26rem",
            width: "100%",
            background: "#111113",
            border: "1px solid #27272a",
            borderRadius: "1rem",
            padding: "1.5rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.05rem", margin: "0 0 0.5rem" }}>
            Kritischer Fehler
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#a1a1aa", margin: "0 0 1rem" }}>
            Die App konnte nicht gestartet werden. Ein Neuladen behebt das
            meistens.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.5rem 1rem",
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            Neu laden
          </button>
        </div>
      </body>
    </html>
  );
}
