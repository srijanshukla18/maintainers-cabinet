import { NextRequest, NextResponse } from "next/server";

const PASSWORD = process.env.CABINET_PASSWORD ?? "cabinet2026";

export function middleware(req: NextRequest) {
  // Let API routes through (webhook needs to be open)
  if (req.nextUrl.pathname.startsWith("/api/webhook")) return NextResponse.next();
  // Let the login endpoint through
  if (req.nextUrl.pathname === "/api/auth") return NextResponse.next();
  // Let static assets through
  if (req.nextUrl.pathname.startsWith("/_next")) return NextResponse.next();
  if (req.nextUrl.pathname === "/favicon.ico") return NextResponse.next();

  const cookie = req.cookies.get("cabinet_auth")?.value;
  if (cookie === PASSWORD) return NextResponse.next();

  // Block API calls
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Redirect pages to login
  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
