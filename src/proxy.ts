import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/auth";
import { ensureDbReady } from "@/lib/db/boot";

export async function proxy(request: NextRequest) {
  try {
    await ensureDbReady();
  } catch {
    // DB may be unavailable during cold start of public routes; dashboard still gated below
  }

  const session = await auth();
  const path = request.nextUrl.pathname;
  const isDashboard = path.startsWith("/dashboard");
  const isLogin = path === "/login";
  const user = session?.user;

  if (isDashboard && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (isLogin && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
