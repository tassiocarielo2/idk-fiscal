"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Branch = {
  id: string;
  cnpj: string;
  razaoSocial: string;
  isHeadquarters: boolean;
};

type FileResult =
  | { file: string; status: "ok"; chave: string; alerts: number }
  | { file: string; status: "duplicate"; chave: string }
  | { file: string; status: "error"; reason: string };

type Summary = { total: number; ok: number; duplicates: number; errors: number };

export default function UploadForm({
  organizationId,
  branches,
}: {
  organizationId: string;
  branches: Branch[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<FileResult[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResults(null);
    setSummary(null);

    if (!branchId) {
      setError("Selecione uma filial");
      return;
    }
    if (files.length === 0) {
      setError("Selecione ao menos um arquivo XML");
      return;
    }

    const fd = new FormData();
    fd.set("organization_id", organizationId);
    fd.set("branch_id", branchId);
    for (const f of files) fd.append("files", f);

    start(async () => {
      const res = await fetch("/api/nfe-inbound/upload", {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? `Falha (${res.status})`);
        return;
      }
      setSummary(json.summary as Summary);
      setResults(json.results as FileResult[]);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Filial destino</label>
        <select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.isHeadquarters ? "[Matriz] " : ""}
              {b.razaoSocial} — {b.cnpj}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">XMLs</label>
        <input
          type="file"
          multiple
          accept=".xml,application/xml,text/xml"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="text-sm"
        />
        {files.length > 0 ? (
          <p className="text-xs text-zinc-500">
            {files.length} arquivo(s) selecionado(s)
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Processando..." : "Enviar"}
        </Button>
      </div>

      {summary ? (
        <div className="border border-zinc-900 rounded p-4 flex flex-col gap-2">
          <p className="text-sm">
            <strong>{summary.ok}</strong> processada(s),{" "}
            <strong>{summary.duplicates}</strong> duplicada(s),{" "}
            <strong>{summary.errors}</strong> com erro de{" "}
            <strong>{summary.total}</strong> arquivo(s).
          </p>
          {results?.length ? (
            <ul className="text-xs flex flex-col gap-1">
              {results.map((r, i) => (
                <li
                  key={i}
                  className={
                    r.status === "ok"
                      ? "text-emerald-400"
                      : r.status === "duplicate"
                        ? "text-zinc-500"
                        : "text-red-400"
                  }
                >
                  {r.file} — {r.status}
                  {r.status === "ok" ? ` (${r.alerts} alertas)` : ""}
                  {r.status === "error" ? `: ${r.reason}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
