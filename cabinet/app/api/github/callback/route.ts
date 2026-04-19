/**
 * GET /api/github/callback
 * GitHub App installation callback.
 * After a user installs the app, GitHub redirects here.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const installationId = searchParams.get("installation_id");
  const setupAction = searchParams.get("setup_action");

  if (!installationId) {
    return NextResponse.redirect(new URL("/?error=no_installation", req.url));
  }

  // Redirect to home — the webhook will have already fired to create the repo records
  return NextResponse.redirect(
    new URL(`/?installed=${installationId}&action=${setupAction ?? "install"}`, req.url)
  );
}
