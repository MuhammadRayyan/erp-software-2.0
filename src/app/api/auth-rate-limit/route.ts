import { NextResponse } from "next/server";
import { checkRateLimit, recordFailedAttempt, clearAttempts } from "@/core/auth/rate-limiter";

export const runtime = "nodejs";  // Force Node runtime — rate-limiter uses in-memory Map + setInterval

export async function POST(request: Request) {
  const status = checkRateLimit(request);
  if (!status.allowed) {
    const retryAfter = Math.ceil((status.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }
  return NextResponse.json({ remaining: status.remaining });
}

export async function PUT(request: Request) {
  recordFailedAttempt(request);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  clearAttempts(request);
  return NextResponse.json({ ok: true });
}
