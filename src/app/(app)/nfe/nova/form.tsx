"use client";

import { useMemo, useState, useTransition } from "react";
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

type Branch = { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string };
type Certificate = {
  id: string;
  branch_id: string | null;
  razao_social_titular: string;
  valid_until: string;
  status: string;
};

type Item = {
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: string;
  valor_unitario: string;
  cst_csosn: string;
};

const itemEmpty = (): Item => ({
  codigo: "",
  descricao: "",
  ncm: "",
  cfop: "5102",
  unidade: "UN",
  quantidade: "1",
  valor_unitario: "0.00",
  cst_csosn: "102",
});

export function NovaNFeForm({
  organizationId,
  branches,
  certificates,
}: {
  organizationId: string;
  branches: Branch[];
  certificates: Certificate[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    chave_acesso?: string;
    protocolo?: string;
    cStat?: string;
    xMotivo?: string;
    status: string;
  } | null>(null);

  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const certsForBranch = useMemo(
    () => certificates.filter((c) => c.branch_id === branchId),
    [certificates, branchId],
  );
  const [certificateId, setCertificateId] = useState(certsForBranch[0]?.id ?? "");
  const [items, setItems] = useState<Item[]>([itemEmpty()]);

  function setItem(i: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, itemEmpty()]);
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    if (!branchId || !certificateId) {
      setError("Selecione filial e certificado A1.");
      return;
    }
    const fd = new FormData(event.currentTarget);
    const payload = {
      organization_id: organizationId,
      branch_id: branchId,
      certificate_id: certificateId,
      ambiente: 2,
      natureza_operacao: String(fd.get("natureza_operacao") ?? "VENDA"),
      destinatario: {
        cnpj_cpf: String(fd.get("dest_doc") ?? "").replace(/\D/g, ""),
        nome: String(fd.get("dest_nome") ?? ""),
        ie: String(fd.get("dest_ie") ?? "") || null,
        uf: String(fd.get("dest_uf") ?? "ES").toUpperCase(),
      },
      itens: items.map((it) => ({
        codigo: it.codigo,
        descricao: it.descricao,
        ncm: it.ncm.replace(/\D/g, ""),
        cfop: it.cfop.replace(/\D/g, ""),
        unidade: it.unidade,
        quantidade: Number(it.quantidade),
        valor_unitario: Number(it.valor_unitario),
        cst_csosn: it.cst_csosn,
      })),
    };

    startTransition(async () => {
      const res = await fetch("/api/nfe/issue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        if (json.status === "rejeitada") {
          setResult(json as Parameters<typeof setResult>[0]);
        } else {
          setError(typeof json.error === "string" ? json.error : "Erro ao emitir.");
        }
        return;
      }
      setResult(json as Parameters<typeof setResult>[0]);
      router.refresh();
    });
  }

  if (branches.length === 0) {
    return (
      <p className="text-sm text-red-500">
        Nenhuma filial. Crie uma em /admin/branches.
      </p>
    );
  }
  if (certificates.length === 0) {
    return (
      <p className="text-sm text-red-500">
        Nenhum certificado A1 ativo. Suba um em /admin/certificates.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <fieldset className="grid grid-cols-2 gap-4 border border-zinc-900 rounded p-5">
        <legend className="text-xs uppercase tracking-widest text-zinc-500 px-2">
          Emissor
        </legend>
        <div>
          <Label>Filial</Label>
          <Select
            value={branchId}
            onValueChange={(v) => {
              const safe = v ?? "";
              setBranchId(safe);
              const next = certificates.filter((c) => c.branch_id === safe);
              setCertificateId(next[0]?.id ?? "");
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.nome_fantasia ?? b.razao_social} ({b.cnpj})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Certificado A1</Label>
          <Select
            value={certificateId}
            onValueChange={(v) => setCertificateId(v ?? "")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {certsForBranch.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.razao_social_titular} (val. {new Date(c.valid_until).toLocaleDateString()})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label>Natureza da operacao</Label>
          <Input name="natureza_operacao" defaultValue="VENDA DE SERVICO" required />
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-4 border border-zinc-900 rounded p-5">
        <legend className="text-xs uppercase tracking-widest text-zinc-500 px-2">
          Destinatario
        </legend>
        <div className="col-span-2">
          <Label>Nome / Razao social</Label>
          <Input name="dest_nome" required maxLength={60} />
        </div>
        <div>
          <Label>CNPJ ou CPF (so digitos)</Label>
          <Input name="dest_doc" required />
        </div>
        <div>
          <Label>UF</Label>
          <Input name="dest_uf" defaultValue="ES" maxLength={2} required />
        </div>
        <div>
          <Label>IE (opcional)</Label>
          <Input name="dest_ie" />
        </div>
      </fieldset>

      <fieldset className="border border-zinc-900 rounded p-5 flex flex-col gap-3">
        <legend className="text-xs uppercase tracking-widest text-zinc-500 px-2">
          Itens
        </legend>
        {items.map((it, idx) => (
          <div
            key={idx}
            className="grid grid-cols-12 gap-2 items-end border border-zinc-900 rounded p-3"
          >
            <div className="col-span-3">
              <Label>Cod.</Label>
              <Input
                value={it.codigo}
                onChange={(e) => setItem(idx, { codigo: e.target.value })}
                required
              />
            </div>
            <div className="col-span-9">
              <Label>Descricao</Label>
              <Input
                value={it.descricao}
                onChange={(e) => setItem(idx, { descricao: e.target.value })}
                required
              />
            </div>
            <div className="col-span-3">
              <Label>NCM</Label>
              <Input
                value={it.ncm}
                onChange={(e) => setItem(idx, { ncm: e.target.value })}
                required
                maxLength={8}
              />
            </div>
            <div className="col-span-2">
              <Label>CFOP</Label>
              <Input
                value={it.cfop}
                onChange={(e) => setItem(idx, { cfop: e.target.value })}
                required
                maxLength={4}
              />
            </div>
            <div className="col-span-2">
              <Label>Un.</Label>
              <Input
                value={it.unidade}
                onChange={(e) => setItem(idx, { unidade: e.target.value })}
                required
              />
            </div>
            <div className="col-span-2">
              <Label>Qtd.</Label>
              <Input
                type="number"
                step="0.0001"
                value={it.quantidade}
                onChange={(e) => setItem(idx, { quantidade: e.target.value })}
                required
              />
            </div>
            <div className="col-span-2">
              <Label>Vlr unit.</Label>
              <Input
                type="number"
                step="0.0001"
                value={it.valor_unitario}
                onChange={(e) => setItem(idx, { valor_unitario: e.target.value })}
                required
              />
            </div>
            <div className="col-span-1 flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => removeItem(idx)}
                disabled={items.length === 1}
              >
                X
              </Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={addItem} className="self-start">
          + Item
        </Button>
      </fieldset>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      {result ? (
        <div className="border border-zinc-900 rounded p-5 text-sm flex flex-col gap-2">
          <p>
            Status: <span className="font-medium">{result.status}</span>
          </p>
          {result.chave_acesso ? (
            <p>
              Chave: <span className="font-mono text-xs">{result.chave_acesso}</span>
            </p>
          ) : null}
          {result.protocolo ? <p>Protocolo: {result.protocolo}</p> : null}
          {result.cStat ? (
            <p className="text-red-500">
              cStat {result.cStat} — {result.xMotivo}
            </p>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Emitindo..." : "Emitir em homologacao"}
      </Button>
    </form>
  );
}
