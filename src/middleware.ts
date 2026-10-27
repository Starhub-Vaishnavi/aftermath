import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { auth, authEnabled } from "@/auth";

const PUBLIC = [/^\/signin(\/|$)/, /^\/api\/auth(\/|$)/, /^\/api\/me$/];

const guarded = auth((req) => {
  const { pathname, search } = req.nextUrl;
  if (req.auth?.user || PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in to use AFTERMATH." }, { status: 401 });
  const url = new URL("/signin", req.nextUrl.origin);
  url.searchParams.set("callbackUrl", pathname + search);
  return NextResponse.redirect(url);
});

export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  if (!authEnabled) return NextResponse.next();
  return guarded(req, ev as never);
}

export const config = { matcher: ["/((?!_next/|favicon\\.ico|.*\\.(?:svg|png|ico|webp)$).*)"] };
