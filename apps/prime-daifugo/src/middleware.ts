import { NextResponse } from "next/server";
import type { MiddlewareConfig, NextRequest } from "next/server";

// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {
  const name = request.cookies.get("name")?.value;
  console.log("name", name);

  if (name == undefined || name.length < 3 || name.length > 10) {
    const url = new URL(request.url);
    url.pathname = "/login";
    url.searchParams.set("callback", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  } else return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config: MiddlewareConfig = {
  matcher: ["/room/:path*"],
};
