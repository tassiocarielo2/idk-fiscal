"use client";

import { useEffect, useState, useTransition } from "react";

interface Branch {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  is_headquarters: boolean;
  uf: string;
  status: string;
}

export function BranchesAdmin({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function load() {
    const res = await fetch(
      `/api/branches?organization_id=${organizationId}`,
      { cache: "no-store" },
    );
    const json = await res.json();
    setBranches(json.branches ?? []);
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/branches?organization_id=${organizationId}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j) => {
        if (active) setBranches(j.branches ?? []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [organizationId]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      organization_id: organizationId,
      cnpj: String(fd.get("cnpj") ?? ""),
      razao_social: String(fd.get("razao_social") ?? ""),
      nome_fantasia: (fd.get("nome_fantasia") as string) || null,
      uf: String(fd.get("uf") ?? ""),
      inscricao_estadual: (fd.get("inscricao_estadual") as string) || null,
      inscricao_municipal: (fd.get("inscricao_municipal") as string) || null,
    };
    const form = e.currentTarget;
    startTransition(async () => {
      const res = await fetch("/api/branches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Falha ao criar filial");
        return;
      }
      form.reset();
      await load();
    });
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
        <h3 className="text-sm font-medium text-zinc-200">Nova filial</h3>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3 text-sm">
          <input
            name="razao_social"
            placeholder="Razao social"
            required
            className="bg-zinc-950 border border-zinc-900 rounded px-3 py-2 col-span-2"
          />
          <input
            name="nome_fantasia"
            placeholder="Nome fantasia (opcional)"
            className="bg-zinc-950 border border-zinc-900 rounded px-3 py-2 col-span-2"
          />
          <input
            name="cnpj"
            placeholder="CNPJ (apenas digitos)"
            required
            className="bg-zinc-950 border border-zinc-900 rounded px-3 py-2"
          />
          <input
            name="uf"
            placeholder="UF"
            maxLength={2}
            required
            className="bg-zinc-950 border border-zinc-900 rounded px-3 py-2"
          />
          <input
            name="inscricao_estadual"
            placeholder="IE (opcional)"
            className="bg-zinc-950 border border-zinc-900 rounded px-3 py-2"
          />
          <input
            name="inscricao_municipal"
            placeholder="IM (opcional)"
            className="bg-zinc-950 border border-zinc-900 rounded px-3 py-2"
          />
          {error ? (
            <p className="col-span-2 text-rose-400 text-xs">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={isPending}
            className="col-span-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-zinc-950 font-medium rounded px-3 py-2"
          >
            {isPending ? "Criando..." : "Criar filial"}
          </button>
        </form>
      </section>

      <section className="border border-zinc-900 rounded">
        <h3 className="text-sm font-medium text-zinc-200 px-6 py-4 border-b border-zinc-900">
          Filiais ({branches.length})
        </h3>
        <ul className="divide-y divide-zinc-900">
          {branches.map((b) => (
            <li
              key={b.id}
              className="px-6 py-4 flex items-center justify-between text-sm"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-200 font-medium">
                    {b.nome_fantasia ?? b.razao_social}
                  </span>
                  {b.is_headquarters ? (
                    <span className="text-[10px] uppercase tracking-widest bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded">
                      matriz
                    </span>
                  ) : null}
                </div>
                <div className="text-zinc-500 text-xs mt-1">
                  {b.razao_social} · {b.cnpj} · {b.uf} · {b.status}
                </div>
              </div>
            </li>
          ))}
          {branches.length === 0 ? (
            <li className="px-6 py-8 text-center text-zinc-500 text-sm">
              Nenhuma filial.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
