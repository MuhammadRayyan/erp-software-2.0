import { NextResponse } from "next/server";
import { getReadiness } from "@/core/health";
import { getMemorySnapshot } from "@/core/memory-monitor";
export const dynamic = "force-dynamic";

// Requests through Caddy always carry X-Forwarded-For. Without it the caller is
// inside the container or host (Docker healthcheck, `docker exec … curl`), so
// memory details are only shown there, never to the public internet.
function isDirectRequest(request?: Request) {
  return request !== undefined && !request.headers.has("x-forwarded-for");
}

export function GET(request?: Request) {
  try {
    const readiness = getReadiness();
    const body = isDirectRequest(request) ? { ...readiness, memory: getMemorySnapshot() } : readiness;
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
