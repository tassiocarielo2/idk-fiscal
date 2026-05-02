import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BranchesAdmin } from "./branches-admin";

export default async function BranchesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("role, organization_id, organizations(razao_social)")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .in("role", ["owner", "admin"])
    .limit(1);

  const m = memberships?.[0];
  if (!m) redirect("/dashboard");

  return (
    <BranchesAdmin
      organizationId={m.organization_id}
      organizationName={
        (m.organizations as unknown as { razao_social: string } | null)
          ?.razao_social ?? "—"
      }
    />
  );
}
