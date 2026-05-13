import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      // Threshold aplica apenas aos módulos puros que já têm suite;
      // expandir o `include` conforme novos testes entrarem (alvo natural:
      // chave-acesso, inbound-rebuild, sefaz/es-config).
      include: ["src/lib/nfe/parser.ts", "src/lib/nfe/alerts.ts"],
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 50,
      },
    },
  },
});
