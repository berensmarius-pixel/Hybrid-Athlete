#!/usr/bin/env node
/**
 * CLI für die wissenschaftliche Wissensbasis (RAG) des AI-Coaches.
 *
 * Voraussetzung: Dev-Server läuft (`npm run dev`) und ist erreichbar.
 *
 *   npm run kb -- status                 → Chunk-/Dokument-Übersicht
 *   npm run kb -- seed                   → kuratiertes Kern-Korpus einfügen (idempotent)
 *   npm run kb -- ingest <pdf|ordner>    → Paper-PDF(s) extrahieren & einfügen
 *   npm run kb -- text "<text>" --title "Notiz"  → Rohtext einfügen
 *   npm run kb -- query "interference effect"    → Retrieval-Test (zeigt Treffer)
 *   npm run kb -- delete "<Dokumenttitel>"       → Dokument entfernen
 *
 * Auth: APP_API_SECRET aus ENV oder .env.local (x-api-key Header).
 * Ziel: HA_BASE_URL (default http://localhost:3000)
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// ─── Mini-.env-Parser (kein Dependency-Zweck, nur KEY=VALUE-Zeilen) ───────────
function loadEnvLocal() {
  try {
    const raw = readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, valueRaw] = match;
      const value = valueRaw.replace(/^["']|["']$/g, "").trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env.local optional
  }
}
loadEnvLocal();

const BASE_URL = (process.env.HA_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const API_SECRET = process.env.APP_API_SECRET || "";

function headers(extra = {}) {
  return API_SECRET ? { "x-api-key": API_SECRET, ...extra } : extra;
}

async function api(method, endpoint, body) {
  const payload =
    typeof body === "string" || body instanceof FormData ? body : body ? JSON.stringify(body) : undefined;
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: headers(payload instanceof FormData ? undefined : { "Content-Type": "application/json" }),
    body: payload,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `HTTP ${res.status} bei ${endpoint}`);
  }
  return json;
}

function listPdfs(targetPath) {
  const abs = path.resolve(targetPath);
  const stat = statSync(abs);
  if (stat.isFile()) return [abs];
  return readdirSync(abs)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .map((f) => path.join(abs, f));
}

// ─── Commands ──────────────────────────────────────────────────────────────────

async function cmdStatus() {
  const { documents, totalChunks } = await api("GET", "/api/kb/documents");
  console.log(`\nWissensbasis: ${totalChunks} Chunks in ${documents.length} Dokumenten\n`);
  for (const doc of documents) {
    console.log(`  • [${doc.kind}] ${doc.documentTitle} (${doc.chunkCount} Chunks)`);
  }
  if (documents.length === 0) {
    console.log("  (leer – mit 'npm run kb -- seed' starten)");
  }
  console.log();
}

async function cmdSeed() {
  const result = await api("POST", "/api/kb/seed", {});
  console.log(`\nSeed abgeschlossen: ${result.stored} Chunks geschrieben (${result.seedUnits} Kuratierte Einheiten, gesamt jetzt ${result.totalChunks}).\n`);
}

async function cmdIngest(targetPath) {
  if (!targetPath) {
    throw new Error("Nutzung: npm run kb -- ingest <pdf-datei|ordner>");
  }
  const pdfs = listPdfs(targetPath);
  if (pdfs.length === 0) throw new Error("Keine PDFs gefunden.");
  console.log(`\nIngestiere ${pdfs.length} PDF(s) ...\n`);

  let ok = 0;
  for (const pdfPath of pdfs) {
    const name = path.basename(pdfPath);
    process.stdout.write(`  → ${name}: Extraktion läuft (Gemini File API, kann ~30–60 s dauern) ... `);
    try {
      const bytes = readFileSync(pdfPath);
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: "application/pdf" }), name);
      const result = await api("POST", "/api/kb/ingest", form);
      console.log(`OK — ${result.stored} Chunks aus ${result.extractedUnits} Einheiten ("${result.documentTitle}", Modell: ${result.usedModel})`);
      ok++;
    } catch (err) {
      console.log(`FEHLER — ${err.message}`);
    }
  }
  console.log(`\nFertig: ${ok}/${pdfs.length} PDF(s) erfolgreich ingested.\n`);
}

async function cmdText(text, title) {
  const form = new FormData();
  form.append("text", text);
  if (title) form.append("title", title);
  const result = await api("POST", "/api/kb/ingest", form);
  console.log(`\nGespeichert: ${result.stored} Chunks unter "${result.documentTitle}".\n`);
}

async function cmdQuery(query) {
  const data = await api("POST", "/api/kb/query", { query, maxChunks: 4 });
  console.log(`\nVerfügbar: ${data.available} | Treffer: ${data.matches.length}\n`);
  for (const match of data.matches) {
    const cite = match.citation?.authors ? `${match.citation.authors}${match.citation.year ? ` (${match.citation.year})` : ""}` : match.documentTitle;
    console.log(`  • [~${Math.round(match.similarity * 100)} %] ${cite}`);
    console.log(`    ${match.content.slice(0, 160).replace(/\n/g, " ")}...\n`);
  }
}

async function cmdDelete(title) {
  if (!title) throw new Error('Nutzung: npm run kb -- delete "<Dokumenttitel>"');
  const result = await api("DELETE", `/api/kb/documents?title=${encodeURIComponent(title)}`);
  console.log(`\nGelöscht: ${result.deleted} Chunks. Verbleibend gesamt: ${result.totalChunks}.\n`);
}

// ─── Entry ──────────────────────────────────────────────────────────────────────

const [, , command, ...args] = process.argv;

try {
  switch (command) {
    case "status":
      await cmdStatus();
      break;
    case "seed":
      await cmdSeed();
      break;
    case "ingest":
      await cmdIngest(args[0]);
      break;
    case "text": {
      const titleFlagIndex = args.indexOf("--title");
      const title = titleFlagIndex >= 0 ? args[titleFlagIndex + 1] : undefined;
      const textValue = titleFlagIndex > 0 ? args.slice(0, titleFlagIndex).join(" ") : args.join(" ");
      await cmdText(textValue, title);
      break;
    }
    case "query":
      await cmdQuery(args.join(" "));
      break;
    case "delete":
      await cmdDelete(args[0]);
      break;
    default:
      console.log(
        [
          "",
          "Hybrid Athlete – Wissensbasis-CLI",
          "",
          "  npm run kb -- status                  Übersicht der Dokumente",
          "  npm run kb -- seed                    kuratiertes Kern-Korpus einfügen",
          "  npm run kb -- ingest <pdf|ordner>     Paper-PDF(s) via Gemini extrahieren",
          '  npm run kb -- text "<text>"           Rohtext als Notiz einfügen',
          '  npm run kb -- query "<frage>"         Retrieval testen',
          '  npm run kb -- delete "<titel>"        Dokument löschen',
          "",
          `Zielserver: ${BASE_URL} (override: HA_BASE_URL)`,
          "",
        ].join("\n")
      );
  }
} catch (err) {
  console.error(`\nFehler: ${err.message}\n`);
  process.exit(1);
}
