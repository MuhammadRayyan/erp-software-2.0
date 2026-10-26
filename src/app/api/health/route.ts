import { NextResponse } from "next/server";
import { getReadiness } from "@/core/health";
export const dynamic = "force-dynamic";
export function GET() {
  try {
    return NextResponse.json(getReadiness(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
