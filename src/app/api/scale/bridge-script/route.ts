import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const scriptPath = path.join(process.cwd(), "scripts", "pi_zero_scale_bridge.py");
    if (fs.existsSync(scriptPath)) {
      const content = fs.readFileSync(scriptPath, "utf-8");
      return new NextResponse(content, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Interner Fehler" },
      { status: 500 }
    );
  }
}
