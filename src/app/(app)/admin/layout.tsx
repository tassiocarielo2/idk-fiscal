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
    .select("role, organization_id")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .in("role", ["owner", "admin"])
    .limit(1);

  if (!memberships || memberships.length === 0) {
    redirect("/dashboard");
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 flex flex-col gap-8">
      <header className="flex items-center justify-between border-b border-zinc-900 pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
        <nav className="flex gap-4 text-sm">
          <Link
            href="/admin/branches"
            className="text-zinc-400 hover:text-emerald-400"
          >
            Filiais
          </Link>
          <Link
            href="/admin/invites"
            className="text-zinc-400 hover:text-emerald-400"
          >
            Convites
          </Link>
          <Link
            href="/dashboard"
            className="text-zinc-500 hover:text-zinc-300"
          >
            ← Dashboard
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
