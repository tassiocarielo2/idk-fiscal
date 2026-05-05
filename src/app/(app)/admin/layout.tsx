import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(razao_social, nome_fantasia)")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .in("role", ["owner", "admin"])
    .limit(1);

  const membership = memberships?.[0];
  if (!membership) redirect("/dashboard");

  const org = membership.organizations as unknown as {
    razao_social: string;
    nome_fantasia: string | null;
  } | null;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-widest text-zinc-500">Admin</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {org?.nome_fantasia ?? org?.razao_social ?? "—"}
        </h1>
      </header>
      <nav className="flex gap-4 border-b border-zinc-900 pb-3 text-sm">
        <Link href="/admin/branches" className="hover:text-zinc-100 text-zinc-400">
          Filiais
        </Link>
        <Link href="/admin/invites" className="hover:text-zinc-100 text-zinc-400">
          Convites
        </Link>
        <Link
          href="/admin/certificates"
          className="hover:text-zinc-100 text-zinc-400"
        >
          Certificados
        </Link>
      </nav>
      {children}
    </div>
  );
}
