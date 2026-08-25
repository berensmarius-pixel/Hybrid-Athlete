import { isAuthConfigured, verifyRequest } from "@/lib/apiAuth";

/** GET /api/auth/check → { authorized } (200) oder 401 wenn gesperrt. */
export async function GET(req: Request) {
  const authorized = await verifyRequest(req);
  return Response.json(
    { authorized, configured: isAuthConfigured() },
    { status: authorized ? 200 : 401 }
  );
}
