import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BranchesClient } from "./branches-client";

export default async function BranchesPage() {
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

  const { data: branches } = await supabase
    .from("organization_branches")
    .select(
      "id, cnpj, razao_social, nome_fantasia, is_headquarters, status, uf, created_at",
    )
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .order("is_headquarters", { ascending: false })
    .order("created_at", { ascending: true });

  return (
    <BranchesClient
      organizationId={membership.organization_id}
      initialBranches={branches ?? []}
    />
  );
}
