import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AcceptInviteSchema } from "@/lib/validation/invite";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = AcceptInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { data: orgId, error } = await supabase.rpc("accept_invite", {
    p_token: parsed.data.token,
  });

  if (error) {
    const code = error.code;
    if (code === "28000") {
      return NextResponse.json(
        { error: "email_mismatch", message: error.message },
        { status: 401 },
      );
    }
    if (code === "42501") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (code === "22023") {
      return NextResponse.json(
        { error: "invalid_invite", message: error.message },
        { status: 400 },
      );
    }
    console.error("[POST /api/invites/accept] rpc failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  return NextResponse.json({ organization_id: orgId });
}
