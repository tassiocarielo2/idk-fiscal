"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Branch = {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  is_headquarters: boolean;
  status: string;
  uf: string;
  created_at: string;
};

export function BranchesClient({
  organizationId,
  initialBranches,
}: {
  organizationId: string;
  initialBranches: Branch[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const fd = new FormData(event.currentTarget);

    startTransition(async () => {
      const res = await fetch("/api/branches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          cnpj: fd.get("cnpj"),
          razao_social: fd.get("razao_social"),
          nome_fantasia: fd.get("nome_fantasia") || null,
          uf: fd.get("uf"),
          inscricao_estadual: fd.get("inscricao_estadual") || null,
          inscricao_municipal: fd.get("inscricao_municipal") || null,
          logradouro: fd.get("logradouro") || "",
          numero: fd.get("numero") || "",
          bairro: fd.get("bairro") || "",
          cep: fd.get("cep") || "",
        }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "Erro ao criar filial.");
        return;
      }
      setShowForm(false);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Filiais ({initialBranches.length})</h2>
        <Button onClick={() => setShowForm((s) => !s)} variant="outline">
          {showForm ? "Cancelar" : "+ Nova filial"}
        </Button>
      </div>

      {showForm ? (
        <form
          onSubmit={onSubmit}
          className="border border-zinc-900 rounded p-5 grid grid-cols-2 gap-3"
        >
          <div className="col-span-2">
            <Label htmlFor="razao_social">Razao social</Label>
            <Input id="razao_social" name="razao_social" required minLength={3} />
          </div>
          <div>
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input id="cnpj" name="cnpj" required placeholder="14 digitos" />
          </div>
          <div>
            <Label htmlFor="uf">UF</Label>
            <Input id="uf" name="uf" required maxLength={2} placeholder="ES" />
          </div>
          <div className="col-span-2">
            <Label htmlFor="nome_fantasia">Nome fantasia</Label>
            <Input id="nome_fantasia" name="nome_fantasia" />
          </div>
          <div>
            <Label htmlFor="inscricao_estadual">Inscricao estadual</Label>
            <Input id="inscricao_estadual" name="inscricao_estadual" />
          </div>
          <div>
            <Label htmlFor="inscricao_municipal">Inscricao municipal</Label>
            <Input id="inscricao_municipal" name="inscricao_municipal" />
          </div>
          <div className="col-span-2">
            <Label htmlFor="logradouro">Logradouro</Label>
            <Input id="logradouro" name="logradouro" />
          </div>
          <div>
            <Label htmlFor="numero">Numero</Label>
            <Input id="numero" name="numero" />
          </div>
          <div>
            <Label htmlFor="bairro">Bairro</Label>
            <Input id="bairro" name="bairro" />
          </div>
          <div>
            <Label htmlFor="cep">CEP (8 digitos)</Label>
            <Input id="cep" name="cep" maxLength={8} />
          </div>
          {error ? (
            <p className="col-span-2 text-sm text-red-500">{error}</p>
          ) : null}
          <div className="col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Criando..." : "Criar filial"}
            </Button>
          </div>
        </form>
      ) : null}

      <ul className="flex flex-col divide-y divide-zinc-900 border border-zinc-900 rounded">
        {initialBranches.length === 0 ? (
          <li className="p-5 text-sm text-zinc-500">Nenhuma filial.</li>
        ) : (
          initialBranches.map((b) => (
            <li key={b.id} className="p-4 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {b.nome_fantasia ?? b.razao_social}
                  {b.is_headquarters ? (
                    <span className="ml-2 text-xs text-emerald-400">[matriz]</span>
                  ) : null}
                </span>
                <span className="text-xs text-zinc-500">
                  {b.cnpj} · {b.uf} · {b.status}
                </span>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
