import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { handleError, jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const inv = await getStore().getInvestigation(id).catch(() => null);
    if (!inv) return jsonError("Investigation not found.", 404);
    return NextResponse.json({ investigation: inv });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await getStore().deleteInvestigation(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
