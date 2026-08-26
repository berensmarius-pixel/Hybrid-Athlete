// ─── Inngest Serve Endpoint (/api/inngest) ───────────────────────────────────
//
// Lokal: npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
// Produktion: INNGEST_SIGNING_KEY setzen – der Endpoint verifiziert dann die
// x-inngest-signature Header. Im Proxy ist diese Route bewusst von der
// Session/Bearer-Auth ausgenommen, da Inngest seine eigene Signatur nutzt.

import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ohne Signing-Key lokal in den Dev-Modus schalten (Inngest Dev Server),
// statt im Cloud-Mode mit 500 zu scheitern.
if (!process.env.INNGEST_SIGNING_KEY && process.env.INNGEST_DEV === undefined) {
  process.env.INNGEST_DEV = "1";
}

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
