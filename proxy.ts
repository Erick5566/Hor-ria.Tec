import { NextRequest, NextResponse } from "next/server";
import { sessionCookie } from "@/lib/server-auth";

export function proxy(request: NextRequest) {
  const protectedRoute =
    request.nextUrl.pathname.startsWith("/painel") ||
    request.nextUrl.pathname.startsWith("/admin");
  if (protectedRoute && !request.cookies.get(sessionCookie)?.value) {
    const url = new URL("/entrar", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/painel/:path*", "/admin/:path*"] };
