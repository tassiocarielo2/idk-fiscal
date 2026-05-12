"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Result = {
  processed: number;
  total_alerts: number;
  errors: Array<{ document_id: string; reason: string }>;
};

export default function ReprocessButton({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (
      !confirm(
        "Reprocessar alertas de TODAS as notas desta organização? Os alertas atuais serão substituídos.",
      )
    ) {
      return;
    }
    setError(null);
    setResult(null);
    start(async () => {
      const res = await fetch("/api/nfe-inbound/reprocess-alerts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? `Falha (${res.status})`);
        return;
      }
      setResult(json as Result);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="text-xs px-3 py-1.5 rounded border border-zinc-800 hover:bg-zinc-900 hover:text-white text-zinc-300 disabled:opacity-50"
      >
        {pending ? "Reprocessando..." : "Reprocessar alertas"}
      </button>
      {result ? (
        <span className="text-[11px] text-zinc-500">
          {result.processed} nota(s), {result.total_alerts} alerta(s)
          {result.errors.length > 0 ? ` · ${result.errors.length} erro(s)` : ""}
        </span>
      ) : null}
      {error ? <span className="text-[11px] text-red-400">{error}</span> : null}
    </div>
  );
}
