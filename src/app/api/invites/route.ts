import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateInviteSchema } from "@/lib/validation/invite";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get("organization_id");
  let q = supabase
    .from("organization_invites")
    .select(
      "id, organization_id, email, role, branch_scope, expires_at, accepted_at, revoked_at, created_at, invited_by",
    )
    .order("created_at", { ascending: false });
  if (orgId) q = q.eq("organization_id", orgId);

  const { data, error } = await q;
  if (error) {
    console.error("[GET /api/invites] error:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ invites: data ?? [] });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  // RLS: UPDATE so eh permitido para owner/admin da org dona do invite.
  const { data, error } = await supabase
    .from("organization_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    console.error("[DELETE /api/invites] error:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found_or_already_resolved" }, { status: 404 });
  }
  return NextResponse.json({ revoked_id: data.id });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // RPC roda com SECURITY DEFINER e enforce permissao via has_org_role
  const { data: invite, error } = await supabase
    .rpc("create_invite", {
      p_organization_id: parsed.data.organization_id,
      p_email: parsed.data.email,
      p_role: parsed.data.role,
      p_branch_scope: parsed.data.branch_scope ?? null,
    })
    .single();

  if (error || !invite) {
    const code = error?.code;
    if (code === "42501") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (code === "22023") {
      return NextResponse.json({ error: "invalid_input", message: error?.message }, { status: 400 });
    }
    if (code === "23505") {
      return NextResponse.json({ error: "invite_already_pending" }, { status: 409 });
    }
    console.error("[POST /api/invites] rpc failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  // Tenta enviar email via Supabase Admin (best-effort).
  // Se falhar, retorna o link como fallback.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const inviteRow = invite as { token: string; email: string; id: string };
  const acceptUrl = `${appUrl}/invite/${inviteRow.token}`;

  let emailDispatched = false;
  try {
    const admin = createAdminClient();
    const { error: emailError } = await admin.auth.admin.inviteUserByEmail(
      inviteRow.email,
      { redirectTo: acceptUrl },
    );
    emailDispatched = !emailError;
  } catch (e) {
    console.warn("[POST /api/invites] email dispatch failed:", e);
  }

  return NextResponse.json({
    invite: { id: inviteRow.id, token: inviteRow.token, email: inviteRow.email },
    accept_url: acceptUrl,
    email_dispatched: emailDispatched,
  });
}
