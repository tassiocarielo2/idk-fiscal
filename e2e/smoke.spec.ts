import { test, expect } from "@playwright/test";

/**
 * Smoke E2E — valida que rotas públicas e auth-redirect estão saudáveis.
 *
 * Ainda não cobre fluxo autenticado (signup → onboarding → dashboard) — isso
 * exige Supabase de teste com seed de usuário, que vira em wave futura.
 *
 * O objetivo aqui é prevenir regressão de rotas/layout sem custo de fixtures
 * de auth: se o servidor sobe e essas páginas renderizam, 80% dos bugs
 * triviais ficam visíveis.
 */

test.describe("Smoke — rotas públicas", () => {
  test("landing renderiza CTA e link de login", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /entrar/i }),
    ).toHaveAttribute("href", "/login");
    await expect(
      page.getByRole("link", { name: /criar conta/i }),
    ).toHaveAttribute("href", "/sign-up");
  });

  test("login mostra form com email + senha + Google", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: /entrar/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/senha/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^entrar$/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /continuar com google/i }),
    ).toBeVisible();
  });

  test("sign-up mostra form de criação de conta", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/senha/i).first()).toBeVisible();
  });

  test("páginas legais e suporte respondem", async ({ page }) => {
    for (const path of [
      "/legal/termos",
      "/legal/privacidade",
      "/help",
      "/status",
    ]) {
      const res = await page.goto(path);
      expect(res?.status(), `${path} responde 200`).toBe(200);
      await expect(page.locator("main, body")).toBeVisible();
    }
  });
});

test.describe("Smoke — auth redirect", () => {
  test("rota privada sem sessão redireciona para /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("rota privada de notas sem sessão redireciona para /login", async ({
    page,
  }) => {
    await page.goto("/notas");
    await expect(page).toHaveURL(/\/login/);
  });
});
