import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isDemoRouteEnabled } from "@/lib/config/demo-server";
import { updateSession } from "@/utils/supabase/middleware";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/demo") && !isDemoRouteEnabled()) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

