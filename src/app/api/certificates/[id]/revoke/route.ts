import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { reason?: string } | null;
  const reason = body?.reason?.trim();
  if (!reason || reason.length < 3) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  const { error } = await supabase.rpc("revoke_certificate", {
    p_certificate_id: id,
    p_reason: reason,
  });

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (error.code === "22023") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error("[revoke_certificate]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
