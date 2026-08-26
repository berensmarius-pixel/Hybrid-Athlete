// ─── Export-Utils: PNG (SVG → Canvas) & CSV ──────────────────────────────────

/** Löst einen Download im Browser aus. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadCsv(
  rows: Array<Record<string, string | number | null | undefined>>,
  filename: string
): void {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(";")),
  ];
  // BOM für Excel-Kompatibilität (Umlaute)
  triggerDownload(
    new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" }),
    filename.endsWith(".csv") ? filename : `${filename}.csv`
  );
}

/** Style-Props, die beim SVG-Klonen vom Computed-Style kopiert werden. */
const COPY_STYLE_PROPS = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-opacity",
  "fill-opacity",
  "opacity",
  "font-size",
  "font-family",
  "font-weight",
  "text-anchor",
  "letter-spacing",
  "dominant-baseline",
] as const;

function inlineComputedStyles(source: Element, target: Element): void {
  const computed = window.getComputedStyle(source);
  const style: Partial<Record<string, string>> = {};
  for (const prop of COPY_STYLE_PROPS) {
    const value = computed.getPropertyValue(prop);
    if (value) style[prop] = value;
  }
  Object.assign((target as HTMLElement).style, style);

  const srcChildren = source.children;
  const tgtChildren = target.children;
  for (let i = 0; i < srcChildren.length; i++) {
    const t = tgtChildren[i];
    if (t) inlineComputedStyles(srcChildren[i], t);
  }
}

/**
 * Rendert alle SVGs innerhalb `container` (z. B. eine ChartCard) in ein
 * dunkles PNG (2× Auflösung) und startet den Download.
 */
export async function exportElementToPng(
  container: HTMLElement,
  filename: string
): Promise<void> {
  const svgs = Array.from(container.querySelectorAll("svg"));
  if (svgs.length === 0) throw new Error("Keine SVG-Grafik gefunden");

  const rect = container.getBoundingClientRect();
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(rect.width * scale));
  canvas.height = Math.max(1, Math.round(rect.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nicht verfügbar");

  // Dunkler Lab-Hintergrund passend zum Theme
  ctx.fillStyle = "#111113";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);

  for (const svg of svgs) {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const svgRect = svg.getBoundingClientRect();
    clone.setAttribute("width", String(svgRect.width));
    clone.setAttribute("height", String(svgRect.height));
    inlineComputedStyles(svg, clone);

    const xml = new XMLSerializer().serializeToString(clone);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, svgRect.left - rect.left, svgRect.top - rect.top, svgRect.width, svgRect.height);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = url;
    });
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (blob) {
    triggerDownload(blob, filename.endsWith(".png") ? filename : `${filename}.png`);
  }
}
