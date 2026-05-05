"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Invite = {
  id: string;
  email: string;
  role: string;
  branch_scope: string[] | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type Branch = {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  is_headquarters: boolean;
};

function statusOf(i: Invite): string {
  if (i.revoked_at) return "revogado";
  if (i.accepted_at) return "aceito";
  if (new Date(i.expires_at) <= new Date()) return "expirado";
  return "pendente";
}

export function InvitesClient({
  organizationId,
  initialInvites,
  branches,
}: {
  organizationId: string;
  initialInvites: Invite[];
  branches: Branch[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const fd = new FormData(event.currentTarget);
    const branchScope = fd
      .getAll("branch_scope")
      .map((v) => String(v))
      .filter(Boolean);

    startTransition(async () => {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          email: String(fd.get("email") ?? ""),
          role,
          branch_scope:
            role === "admin" || branchScope.length === 0 ? null : branchScope,
        }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "Erro ao criar convite.");
        return;
      }
      setShowForm(false);
      router.refresh();
    });
  }

  function revoke(id: string) {
    startTransition(async () => {
      const res = await fetch(`/api/invites/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Erro ao revogar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">
          Convites ({initialInvites.length})
        </h2>
        <Button onClick={() => setShowForm((s) => !s)} variant="outline">
          {showForm ? "Cancelar" : "+ Novo convite"}
        </Button>
      </div>

      {showForm ? (
        <form
          onSubmit={onSubmit}
          className="border border-zinc-900 rounded p-5 flex flex-col gap-3"
        >
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              maxLength={254}
            />
          </div>
          <div>
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">admin</SelectItem>
                <SelectItem value="member">member</SelectItem>
                <SelectItem value="viewer">viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {role !== "admin" ? (
            <fieldset className="flex flex-col gap-2 border border-zinc-900 rounded p-3">
              <legend className="text-xs uppercase tracking-widest text-zinc-500 px-1">
                Escopo de filiais (vazio = todas)
              </legend>
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="branch_scope"
                    value={b.id}
                  />
                  {b.nome_fantasia ?? b.razao_social} · {b.cnpj}
                  {b.is_headquarters ? " (matriz)" : ""}
                </label>
              ))}
            </fieldset>
          ) : null}
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Enviando..." : "Enviar convite"}
          </Button>
        </form>
      ) : null}

      <ul className="flex flex-col divide-y divide-zinc-900 border border-zinc-900 rounded">
        {initialInvites.length === 0 ? (
          <li className="p-5 text-sm text-zinc-500">Nenhum convite.</li>
        ) : (
          initialInvites.map((inv) => {
            const st = statusOf(inv);
            return (
              <li
                key={inv.id}
                className="p-4 flex items-center justify-between gap-4"
              >
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-medium truncate">
                    {inv.email}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {inv.role} · {st}
                    {inv.branch_scope?.length
                      ? ` · ${inv.branch_scope.length} filial(is)`
                      : ""}
                  </span>
                </div>
                {st === "pendente" ? (
                  <Button
                    variant="outline"
                    onClick={() => revoke(inv.id)}
                    disabled={pending}
                  >
                    Revogar
                  </Button>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
