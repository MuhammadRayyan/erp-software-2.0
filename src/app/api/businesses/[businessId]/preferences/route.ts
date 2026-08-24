import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/core/auth/api-auth";
import { clearPreferences, listPreferences, upsertPreferences } from "@/modules/preferences/preference-service";

export const runtime = "nodejs";

const upsertBody = z.object({
  preferences: z.record(z.string(), z.string()),
});

const MAX_PAIRS_PER_REQUEST = 32;

/**
 * GET /api/businesses/[businessId]/preferences
 *
 * Returns every stored UI preference for the signed-in user+business as a
 * flat `Record<string,string>` of JSON-encoded values. The map is empty
 * when the user has not yet customized anything — callers apply their own
 * defaults on top.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const auth = await requireApiAuth(request, { businessId: (await params).businessId });
  if ("error" in auth) return auth.error;
  const { businessId } = await params;
  const preferences = listPreferences(businessId, auth.session.user.id);
  return NextResponse.json({ preferences });
}

/**
 * PUT /api/businesses/[businessId]/preferences
 *
 * Upserts up to 32 (key, value) pairs atomically. Each value is a string
 * (≤ 8 KB) — clients serialize JSON themselves since the maps we store
 * (column visibility, KPI card toggles) are tiny. Returns `{ ok: true }`
 * on success; throws on validation errors (status 400) or auth failures
 * (status 401/403, handled by requireApiAuth).
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const auth = await requireApiAuth(request, { businessId: (await params).businessId });
  if ("error" in auth) return auth.error;
  const { businessId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = upsertBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid preferences payload." },
      { status: 400 },
    );
  }
  if (Object.keys(parsed.data.preferences).length > MAX_PAIRS_PER_REQUEST) {
    return NextResponse.json(
      { error: `Too many preference keys in one write (max ${MAX_PAIRS_PER_REQUEST}).` },
      { status: 400 },
    );
  }

  try {
    upsertPreferences(businessId, auth.session.user.id, parsed.data.preferences);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save preferences.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/businesses/[businessId]/preferences
 *
 * Wipes every stored preference for this user+business. Used by the
 * "Reset to defaults" UI affordance — clients should also clear their
 * localStorage mirrors so the next render uses component defaults.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const auth = await requireApiAuth(request, { businessId: (await params).businessId });
  if ("error" in auth) return auth.error;
  const { businessId } = await params;
  const deleted = clearPreferences(businessId, auth.session.user.id);
  return NextResponse.json({ ok: true, deleted });
}
