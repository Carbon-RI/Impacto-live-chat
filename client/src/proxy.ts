import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isDemoRouteEnabled } from "@/lib/config/demo-server";

export function proxy(request: NextRequest) {
  if (!isDemoRouteEnabled()) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/demo/:path*"],
};

