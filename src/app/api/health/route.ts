import { NextResponse } from "next/server";
import { getReadiness } from "@/core/health";
import { getMemorySnapshot } from "@/core/memory-monitor";
export const dynamic = "force-dynamic";

// Memory details are only for callers inside the container or host (Docker
// healthcheck, `docker exec … curl localhost:3000/api/health`). Next.js fills
// X-Forwarded-For with the socket address when it is missing, so a direct call
// arrives as loopback. Caddy replaces any client-sent X-Forwarded-For with the
// real client IP, so a public request can never present as loopback.
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function isDirectRequest(request?: Request) {
  if (!request) return false;
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor === null) return true;
  const hops = forwardedFor.split(",").map((hop) => hop.trim()).filter(Boolean);
  return hops.length > 0 && hops.every((hop) => LOOPBACK.has(hop));
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
