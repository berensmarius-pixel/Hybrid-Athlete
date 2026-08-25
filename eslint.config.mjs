import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Explizite anys in UI-Komponenten: Warnungen (Altlasten schrittweise beseitigen)
      "@typescript-eslint/no-explicit-any": "warn",
      // Leere Catch-Blöcke verstecken Fehler – mindestens ein Kommentar pflicht
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
  {
    // Daten-Grenzen (Services, Server-Code, Typen): hier ist `any` verboten –
    // genau dort fließen untrusted Daten (APIs, LLM-Antworten, Storage).
    files: [
      "src/lib/**/*.ts",
      "src/app/api/**/*.ts",
      "src/types/**/*.ts",
      "src/hooks/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
