"use client";

import { useEffect, useState, useTransition } from "react";

interface Invite {
  id: string;
  email: string;
  role: "admin" | "member" | "viewer";
  branch_scope: string[] | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface Branch {
  id: string;
  razao_social: string;
  is_headquarters: boolean;
}

type Role = "admin" | "member" | "viewer";

export function InvitesAdmin({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [role, setRole] = useState<Role>("member");
  const [scopeIds, setScopeIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function loadInvites() {
    const res = await fetch(
      `/api/invites?organization_id=${organizationId}`,
      { cache: "no-store" },
    );
    const json = await res.json();
    setInvites(json.invites ?? []);
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/invites?organization_id=${organizationId}`, {
        cache: "no-store",
      }).then((r) => r.json()),
      fetch(`/api/branches?organization_id=${organizationId}`, {
        cache: "no-store",
      }).then((r) => r.json()),
    ])
      .then(([inv, br]) => {
        if (!active) return;
        setInvites(inv.invites ?? []);
        setBranches(br.branches ?? []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [organizationId]);

  function toggleScope(id: string) {
    setScopeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const branchScope =
      role === "admin" || scopeIds.size === 0 ? null : Array.from(scopeIds);

    const form = e.currentTarget;
    startTransition(async () => {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          email,
          role,
          branch_scope: branchScope,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Falha ao criar convite");
        return;
      }
      setInfo(
        j.email_dispatched
          ? `Convite enviado para ${email}. Link: ${j.accept_url}`
          : `Convite criado. Email nao enviado; use o link: ${j.accept_url}`,
      );
      form.reset();
      setScopeIds(new Set());
      await loadInvites();
    });
  }

  function onRevoke(id: string) {
    startTransition(async () => {
      const res = await fetch(`/api/invites?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Falha ao revogar");
        return;
      }
      await loadInvites();
    });
  }

  function statusOf(i: Invite): string {
    if (i.revoked_at) return "revogado";
    if (i.accepted_at) return "aceito";
    if (new Date(i.expires_at) <= new Date()) return "expirado";
    return "pendente";
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500">
          Organizacao
        </p>
        <h2 className="text-lg font-medium tracking-tight mt-1">
          {organizationName}
        </h2>
      </div>

      <section className="border border-zinc-900 rounded p-6 flex flex-col gap-4">
        <h3 className="text-sm font-medium text-zinc-200">Novo convite</h3>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 text-sm">
          <input
            name="email"
            type="email"
            placeholder="email@exemplo.com"
            required
            className="bg-zinc-950 border border-zinc-900 rounded px-3 py-2"
          />
          <div className="flex gap-3">
            {(["admin", "member", "viewer"] as Role[]).map((r) => (
              <label key={r} className="flex items-center gap-2 text-zinc-300">
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={role === r}
                  onChange={() => setRole(r)}
                />
                {r}
              </label>
            ))}
          </div>

          {role !== "admin" ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-zinc-500">
                Escopo de filial (vazio = todas)
              </p>
              <div className="flex flex-wrap gap-2">
                {branches.map((b) => (
                  <label
                    key={b.id}
                    className="flex items-center gap-2 border border-zinc-900 rounded px-2 py-1 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={scopeIds.has(b.id)}
                      onChange={() => toggleScope(b.id)}
                    />
                    {b.razao_social}
                    {b.is_headquarters ? " (matriz)" : ""}
                  </label>
                ))}
                {branches.length === 0 ? (
                  <span className="text-zinc-600 text-xs">
                    Sem filiais cadastradas.
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {error ? <p className="text-rose-400 text-xs">{error}</p> : null}
          {info ? <p className="text-emerald-400 text-xs">{info}</p> : null}

          <button
            type="submit"
            disabled={isPending}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-zinc-950 font-medium rounded px-3 py-2"
          >
            {isPending ? "Enviando..." : "Enviar convite"}
          </button>
        </form>
      </section>

      <section className="border border-zinc-900 rounded">
        <h3 className="text-sm font-medium text-zinc-200 px-6 py-4 border-b border-zinc-900">
          Convites ({invites.length})
        </h3>
        <ul className="divide-y divide-zinc-900">
          {invites.map((i) => {
            const st = statusOf(i);
            return (
              <li
                key={i.id}
                className="px-6 py-4 flex items-center justify-between text-sm"
              >
                <div>
                  <div className="text-zinc-200">{i.email}</div>
                  <div className="text-zinc-500 text-xs mt-1">
                    {i.role} ·{" "}
                    {i.branch_scope?.length
                      ? `${i.branch_scope.length} filial(is)`
                      : "todas filiais"}{" "}
                    · {st} · expira{" "}
                    {new Date(i.expires_at).toLocaleDateString()}
                  </div>
                </div>
                {st === "pendente" ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => onRevoke(i.id)}
                    className="text-rose-400 hover:text-rose-300 text-xs disabled:opacity-50"
                  >
                    revogar
                  </button>
                ) : null}
              </li>
            );
          })}
          {invites.length === 0 ? (
            <li className="px-6 py-8 text-center text-zinc-500 text-sm">
              Nenhum convite.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
