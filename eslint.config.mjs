import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import noArbitraryTailwind from "./eslint-rules/no-arbitrary-tailwind.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Lokale prosjekt-regler — se eslint-rules/.
    plugins: {
      skn: { rules: { "no-arbitrary-tailwind": noArbitraryTailwind } },
    },
    rules: {
      "skn/no-arbitrary-tailwind": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Regelen skal ikke kjøre på seg selv.
    "eslint-rules/**",
  ]),
]);

export default eslintConfig;
