"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    if (!agreed) {
      setError("Voce precisa aceitar os termos antes de criar a conta.");
      return;
    }
    startTransition(async () => {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      // Registra consent (best-effort; bloqueia signup se falhar tambem nao
      // resolve nada porque user ja foi criado).
      if (data.user) {
        await Promise.all([
          supabase.from("user_consents").insert({
            user_id: data.user.id,
            kind: "terms_of_use",
            document_version: "v1-2026-05-02",
          }),
          supabase.from("user_consents").insert({
            user_id: data.user.id,
            kind: "privacy_policy",
            document_version: "v1-2026-05-02",
          }),
        ]).catch(() => null);
      }
      if (data.session) {
        router.refresh();
        router.push("/onboarding");
        return;
      }
      setInfo("Confira seu email para confirmar a conta.");
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Criar conta</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Comece a usar o IDK Fiscal em segundos.
        </p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <label className="flex gap-2 items-start text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1"
          />
          <span>
            Li e aceito os{" "}
            <Link href="/legal/termos" className="underline" target="_blank">
              Termos de Uso
            </Link>{" "}
            e a{" "}
            <Link
              href="/legal/privacidade"
              className="underline"
              target="_blank"
            >
              Politica de Privacidade
            </Link>
            .
          </span>
        </label>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        {info ? <p className="text-sm text-zinc-400">{info}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Criando..." : "Criar conta"}
        </Button>
      </form>
      <p className="text-sm text-zinc-500 text-center">
        Ja tem conta?{" "}
        <Link href="/login" className="text-zinc-200 underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
