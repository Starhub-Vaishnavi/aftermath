import { NextResponse } from "next/server";
import { auth, authEnabled } from "@/auth";

export const runtime = "nodejs";

/** Tells the client whether sign-in is on and who is signed in. */
export async function GET() {
  if (!authEnabled) return NextResponse.json({ enabled: false, user: null });
  const session = await auth();
  const u = session?.user;
  return NextResponse.json({ enabled: true, user: u?.id ? { id: u.id, name: u.name ?? null, image: u.image ?? null } : null });
}
