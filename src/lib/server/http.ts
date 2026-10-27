import { NextResponse } from "next/server";
import { IngestError } from "../ingest/zip";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handleError(err: unknown) {
  if (err instanceof IngestError) return jsonError(err.message, err.status);
  console.error("[aftermath]", err);
  return jsonError("Something went wrong on the server. Check the logs for details.", 500);
}
