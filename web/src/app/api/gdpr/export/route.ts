import { after } from "next/server";
import { generateExport } from "@/lib/gdpr/export/generate-export";
import { requestExport } from "@/lib/gdpr/export/request-export";
import { requireApiAuth } from "@/lib/permissions/require-api-auth";

// POST /api/gdpr/export: the signed-in user asks for their data export (#165) with the
// code from POST /api/gdpr/export/otp. Body: { "code": "123456" }. The ZIP is built
// after the response; the link arrives by email when it is ready.
export async function POST(request: Request): Promise<Response> {
  const user = await requireApiAuth();
  if (user instanceof Response) {
    return user;
  }

  const code = await readCode(request);
  if (code === null) {
    return Response.json({ error: "A code is required" }, { status: 400 });
  }

  // The user id comes from the session, never from the body
  const result = await requestExport(user.id, code);
  if (!result.requested) {
    // One answer for wrong, expired and exhausted codes: nothing to tell them apart
    return result.reason === "invalid_code"
      ? Response.json({ error: "Invalid or expired code" }, { status: 403 })
      : Response.json({ error: "An export is already in progress" }, { status: 409 });
  }

  // generateExport never throws: a failure leaves the export marked failed
  after(async () => {
    await generateExport(result.exportId);
  });
  return Response.json({ export_id: result.exportId, status: "pending" }, { status: 202 });
}

async function readCode(request: Request): Promise<string | null> {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || !("code" in body)) return null;
    return typeof body.code === "string" && body.code !== "" ? body.code : null;
  } catch {
    return null;
  }
}
