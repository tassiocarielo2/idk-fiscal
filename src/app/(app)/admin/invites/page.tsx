import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InvitesClient } from "./invites-client";

export default async function InvitesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .in("role", ["owner", "admin"])
    .limit(1);

  const membership = memberships?.[0];
  if (!membership) redirect("/dashboard");

  const [{ data: invites }, { data: branches }] = await Promise.all([
    supabase
      .from("organization_invites")
      .select(
        "id, email, role, branch_scope, expires_at, accepted_at, revoked_at, created_at",
      )
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("organization_branches")
      .select("id, razao_social, nome_fantasia, cnpj, is_headquarters")
      .eq("organization_id", membership.organization_id)
      .is("deleted_at", null),
  ]);

  return (
    <InvitesClient
      organizationId={membership.organization_id}
      initialInvites={invites ?? []}
      branches={branches ?? []}
    />
  );
}
