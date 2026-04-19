import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE = "cabinet-auth";
const VALID_PASSWORD = process.env.CABINET_PASSWORD ?? "cabinet2026";

const PUBLIC_PATHS = [
  "/api/webhook",
  "/api/auth",
  "/api/github/callback",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Pages — redirect to login if no cookie
  if (!pathname.startsWith("/api")) {
    if (pathname === "/login") return NextResponse.next();
    const cookie = req.cookies.get(AUTH_COOKIE)?.value;
    if (cookie === VALID_PASSWORD) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // API routes — allow public webhook/auth, require cookie for everything else
  for (const pub of PUBLIC_PATHS) {
    if (pathname.startsWith(pub)) return NextResponse.next();
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie === VALID_PASSWORD) return NextResponse.next();

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};