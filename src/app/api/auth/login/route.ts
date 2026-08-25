import { NextResponse } from "next/server";
import {
  computeSessionToken,
  isAuthConfigured,
  verifyPassword,
} from "@/lib/apiAuth";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 Tage

/**
 * POST /api/auth/login
 * Body: { password }
 * Setzt bei Erfolg das HttpOnly Session-Cookie für alle /api/* Routen.
 */
export async function POST(req: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json({ success: true, configured: false });
  }

  let password = "";
  try {
    const body = await req.json();
    if (typeof body?.password === "string") password = body.password;
  } catch {
    // Body konnte nicht gelesen werden
  }

  if (!password) {
    return NextResponse.json(
      { success: false, error: "Passwort erforderlich." },
      { status: 400 }
    );
  }

  if (!(await verifyPassword(password))) {
    // Kleine Verzögerung gegen Brute-Force
    await new Promise((resolve) => setTimeout(resolve, 700));
    return NextResponse.json(
      { success: false, error: "Falsches Passwort." },
      { status: 401 }
    );
  }

  const isHttps =
    req.headers.get("x-forwarded-proto") === "https" ||
    new URL(req.url).protocol === "https:";

  const res = NextResponse.json({ success: true });
  res.cookies.set("ha_session", await computeSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: isHttps,
  });
  return res;
}
