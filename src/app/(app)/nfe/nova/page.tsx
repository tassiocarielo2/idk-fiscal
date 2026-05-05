import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NovaNFeForm } from "./form";

export default async function NovaNFePage() {
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
    .limit(1);

  const membership = memberships?.[0];
  if (!membership) redirect("/onboarding");

  const [{ data: branches }, { data: certificates }] = await Promise.all([
    supabase
      .from("organization_branches")
      .select("id, razao_social, nome_fantasia, cnpj")
      .eq("organization_id", membership.organization_id)
      .is("deleted_at", null)
      .order("is_headquarters", { ascending: false }),
    supabase
      .from("certificates_metadata")
      .select("id, branch_id, razao_social_titular, valid_until, status")
      .eq("organization_id", membership.organization_id)
      .eq("status", "active"),
  ]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500">NF-e</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nova NF-e (homologacao)
        </h1>
      </div>
      <NovaNFeForm
        organizationId={membership.organization_id}
        branches={branches ?? []}
        certificates={certificates ?? []}
      />
    </div>
  );
}
