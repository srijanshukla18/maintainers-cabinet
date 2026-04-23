import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE = "cabinet-auth";
const VALID_PASSWORD = process.env.CABINET_PASSWORD;

const PUBLIC_PATHS = ["/api/webhook", "/api/auth", "/api/github/callback", "/api/discord", "/api/security"];

function missingPasswordResponse(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.json({ error: "CABINET_PASSWORD is not configured" }, { status: 503 });
  }
  return new NextResponse("CABINET_PASSWORD is not configured", { status: 503 });
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!VALID_PASSWORD) {
    const isPublicApi = PUBLIC_PATHS.some((pub) => pathname.startsWith(pub));
    if (!isPublicApi) return missingPasswordResponse(req);
  }

  if (!pathname.startsWith("/api")) {
    if (pathname === "/login") return NextResponse.next();
    const cookie = req.cookies.get(AUTH_COOKIE)?.value;
    if (cookie && VALID_PASSWORD && cookie === VALID_PASSWORD) return NextResponse.next();
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  for (const pub of PUBLIC_PATHS) {
    if (pathname.startsWith(pub)) return NextResponse.next();
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && VALID_PASSWORD && cookie === VALID_PASSWORD) return NextResponse.next();

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
