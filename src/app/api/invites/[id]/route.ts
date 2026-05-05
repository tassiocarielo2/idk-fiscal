import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// DELETE /api/invites/:id  → revoga (idempotente)
export async function DELETE(
  _request: NextRequest,
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
  const { error } = await supabase.rpc("revoke_invite", { p_invite_id: id });

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (error.code === "22023") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error("[revoke_invite]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
