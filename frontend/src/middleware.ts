import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup"];

export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("taskflow_session");
  const isPublic = PUBLIC_PATHS.includes(req.nextUrl.pathname);

  if (!hasSession && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (hasSession && isPublic) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|.*\\.).*)"],
};
