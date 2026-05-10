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

type Cert = {
  id: string;
  branch_id: string | null;
  cnpj_titular: string;
  razao_social_titular: string;
  subject_cn: string | null;
  issuer_cn: string | null;
  valid_from: string;
  valid_until: string;
  serial_number: string;
  status: string;
  purpose: string;
  vault_secret_ref: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  uploaded_at: string;
};

type Branch = {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  is_headquarters: boolean;
};

const PURPOSES = ["multi", "nfe", "nfse", "cte", "mdfe", "recepcao_eventos"] as const;

export function CertificatesClient({
  organizationId,
  initialCertificates,
  branches,
}: {
  organizationId: string;
  initialCertificates: Cert[];
  branches: Branch[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [branchId, setBranchId] = useState<string>(branches[0]?.id ?? "");
  const [purpose, setPurpose] = useState<string>("multi");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const fd = new FormData(event.currentTarget);
    if (!branchId) {
      setError("Selecione uma filial.");
      return;
    }
    fd.set("organization_id", organizationId);
    fd.set("branch_id", branchId);
    fd.set("purpose", purpose);

    startTransition(async () => {
      const res = await fetch("/api/certificates/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "Erro ao subir certificado.");
        return;
      }
      setShowForm(false);
      router.refresh();
    });
  }

  function revoke(id: string) {
    const reason = window.prompt("Motivo da revogacao?");
    if (!reason || reason.trim().length < 3) return;
    startTransition(async () => {
      const res = await fetch(`/api/certificates/${id}/revoke`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
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
          Certificados ({initialCertificates.length})
        </h2>
        <Button onClick={() => setShowForm((s) => !s)} variant="outline">
          {showForm ? "Cancelar" : "+ Subir A1"}
        </Button>
      </div>

      {showForm ? (
        <form
          onSubmit={onSubmit}
          className="border border-zinc-900 rounded p-5 flex flex-col gap-3"
        >
          <div>
            <Label htmlFor="branch">Filial</Label>
            <Select value={branchId} onValueChange={(v) => setBranchId(v ?? "")}>
              <SelectTrigger id="branch">
                <SelectValue placeholder="Selecione uma filial" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.nome_fantasia ?? b.razao_social} ({b.cnpj})
                    {b.is_headquarters ? " · matriz" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="purpose">Proposito</Label>
            <Select value={purpose} onValueChange={(v) => setPurpose(v ?? "")}>
              <SelectTrigger id="purpose">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PURPOSES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="file">Arquivo .pfx</Label>
            <Input
              id="file"
              name="file"
              type="file"
              accept=".pfx,.p12,application/x-pkcs12"
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Senha do certificado</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Subindo..." : "Subir certificado"}
          </Button>
        </form>
      ) : null}

      <ul className="flex flex-col divide-y divide-zinc-900 border border-zinc-900 rounded">
        {initialCertificates.length === 0 ? (
          <li className="p-5 text-sm text-zinc-500">Nenhum certificado.</li>
        ) : (
          initialCertificates.map((c) => {
            const today = Date.now();
            const expiresIn = Math.floor(
              (new Date(c.valid_until).getTime() - today) /
                (1000 * 60 * 60 * 24),
            );
            return (
              <li key={c.id} className="p-4 flex items-center justify-between gap-4">
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-medium truncate">
                    {c.razao_social_titular} · {c.cnpj_titular}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {c.purpose} · {c.status} ·{" "}
                    {c.status === "active" && expiresIn >= 0
                      ? `expira em ${expiresIn}d`
                      : `expirou ${new Date(c.valid_until).toLocaleDateString()}`}
                  </span>
                  {c.revoke_reason ? (
                    <span className="text-xs text-red-500 mt-1">
                      Revogado: {c.revoke_reason}
                    </span>
                  ) : null}
                </div>
                {c.status === "active" ? (
                  <Button
                    variant="outline"
                    onClick={() => revoke(c.id)}
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
