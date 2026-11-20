import { after, NextRequest } from "next/server";
import { withPublicUrl } from "@/lib/auth/public-url";
import { deliverExport } from "@/lib/gdpr/export/deliver-export";
import { requestExport } from "@/lib/gdpr/export/request-export";
import { requireApiAuth } from "@/lib/permissions/require-api-auth";

// POST /api/gdpr/export: the signed-in user asks for their data export (#165) with the
// code from POST /api/gdpr/export/otp. Body: { "otp": "123456" }. The ZIP is built
// after the response; the link arrives by email when it is ready (a failed
// email marks the export failed).
export async function POST(request: Request): Promise<Response> {
  const user = await requireApiAuth();
  if (user instanceof Response) {
    return user;
  }

  const otp = await readOtp(request);
  if (otp === null) {
    return Response.json({ error: "otp is required" }, { status: 400 });
  }

  // The user id comes from the session, never from the body
  const result = await requestExport(user.id, otp);
  if (!result.requested) {
    // One answer for wrong, expired and exhausted codes: nothing to tell them apart
    return result.reason === "invalid_code"
      ? Response.json({ error: "Invalid or expired code" }, { status: 403 })
      : Response.json({ error: "An export is already active" }, { status: 409 });
  }

  // The link in the email must point where the user reaches the app, not at the container
  const { origin } = new URL(withPublicUrl(new NextRequest(request.url, { headers: request.headers })).url);
  // deliverExport never throws: a failure leaves the export marked failed
  after(async () => {
    await deliverExport(result.exportId, origin);
  });
  return Response.json({ export_id: result.exportId, status: "pending" }, { status: 202 });
}

async function readOtp(request: Request): Promise<string | null> {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || !("otp" in body)) return null;
    return typeof body.otp === "string" && body.otp !== "" ? body.otp : null;
  } catch {
    return null;
  }
}
