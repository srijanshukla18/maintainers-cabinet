import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

const MAX_AGE_MS = 5 * 60 * 1000;

export function verifySignedRequest(req: NextRequest, rawBody: string) {
  const secret = process.env.CABINET_INGEST_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CABINET_INGEST_SECRET is not configured" }, { status: 503 });
  }

  const timestamp = req.headers.get("x-cabinet-timestamp") ?? "";
  const signature = req.headers.get("x-cabinet-signature") ?? "";
  const parsedTimestamp = Number(timestamp);

  if (!timestamp || !signature || Number.isNaN(parsedTimestamp)) {
    return NextResponse.json({ error: "Missing signed-ingest headers" }, { status: 401 });
  }

  if (Math.abs(Date.now() - parsedTimestamp) > MAX_AGE_MS) {
    return NextResponse.json({ error: "Expired signed-ingest request" }, { status: 401 });
  }

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const provided = signature.startsWith("sha256=") ? signature.slice(7) : signature;

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return NextResponse.json({ error: "Invalid signed-ingest request" }, { status: 401 });
  }

  return null;
}
