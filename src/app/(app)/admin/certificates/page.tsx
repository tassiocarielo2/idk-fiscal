import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CertificatesClient } from "./certificates-client";

export default async function CertificatesPage() {
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

  const [{ data: certificates }, { data: branches }] = await Promise.all([
    supabase
      .from("certificates_metadata")
      .select(
        "id, branch_id, cnpj_titular, razao_social_titular, subject_cn, issuer_cn, valid_from, valid_until, serial_number, status, purpose, vault_secret_ref, revoked_at, revoke_reason, uploaded_at",
      )
      .eq("organization_id", membership.organization_id)
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("organization_branches")
      .select("id, razao_social, nome_fantasia, cnpj, is_headquarters")
      .eq("organization_id", membership.organization_id)
      .is("deleted_at", null)
      .order("is_headquarters", { ascending: false }),
  ]);

  return (
    <CertificatesClient
      organizationId={membership.organization_id}
      initialCertificates={certificates ?? []}
      branches={branches ?? []}
    />
  );
}
