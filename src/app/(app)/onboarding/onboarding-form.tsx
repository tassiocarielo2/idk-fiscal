"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOrganization } from "@/server/organizations/create-organization";
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
import type { RegimeTributario } from "@/lib/validation/organization";

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA",
  "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN",
  "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

export function OnboardingForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [regime, setRegime] = useState<RegimeTributario | "">("");
  const [uf, setUf] = useState<string>("");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    if (!regime || !uf) {
      setError("Selecione regime tributario e UF.");
      return;
    }

    startTransition(async () => {
      const result = await createOrganization({
        cnpj: String(formData.get("cnpj") ?? ""),
        razao_social: String(formData.get("razao_social") ?? ""),
        nome_fantasia: (formData.get("nome_fantasia") as string) || null,
        regime_tributario: regime as RegimeTributario,
        uf,
        inscricao_estadual: (formData.get("inscricao_estadual") as string) || null,
        inscricao_municipal: (formData.get("inscricao_municipal") as string) || null,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      router.push("/dashboard");
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="cnpj">CNPJ</Label>
        <Input
          id="cnpj"
          name="cnpj"
          required
          placeholder="00.000.000/0000-00"
          inputMode="numeric"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="razao_social">Razao social</Label>
        <Input id="razao_social" name="razao_social" required minLength={3} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="nome_fantasia">Nome fantasia (opcional)</Label>
        <Input id="nome_fantasia" name="nome_fantasia" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="regime_tributario">Regime tributario</Label>
          <Select
            value={regime}
            onValueChange={(v) => setRegime((v ?? "") as RegimeTributario)}
          >
            <SelectTrigger id="regime_tributario">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
              <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
              <SelectItem value="lucro_real">Lucro Real</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="uf">UF</Label>
          <Select value={uf} onValueChange={(v) => setUf(v ?? "")}>
            <SelectTrigger id="uf">
              <SelectValue placeholder="UF" />
            </SelectTrigger>
            <SelectContent>
              {UFS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="inscricao_estadual">Inscricao estadual</Label>
          <Input id="inscricao_estadual" name="inscricao_estadual" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="inscricao_municipal">Inscricao municipal</Label>
          <Input id="inscricao_municipal" name="inscricao_municipal" />
        </div>
      </div>
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Salvando..." : "Criar organizacao"}
      </Button>
    </form>
  );
}
