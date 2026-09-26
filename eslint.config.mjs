import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

/**
 * The mock database lives behind the API seam in `src/lib/api`. Components must
 * never reach past it — that is what keeps swapping in a real backend a
 * one-folder rewrite instead of a codebase-wide one. These rules are the seam's
 * only real defense, so they are errors rather than warnings.
 */
const SEAM_RULE = [
  "error",
  {
    patterns: [
      {
        group: ["@/lib/mock", "@/lib/mock/*", "@/lib/mock/**"],
        message:
          "Go through @/lib/api — the mock DB is behind the API seam. See CLAUDE.md.",
      },
      {
        group: ["@faker-js/faker"],
        message:
          "faker is a devDependency and may only be imported from src/lib/mock/seed/**.",
      },
    ],
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,

  { rules: { "no-restricted-imports": SEAM_RULE } },

  // The seam itself, and the mock internals, may import the mock DB.
  {
    files: ["src/lib/api/**", "src/lib/mock/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@faker-js/faker"],
              message: "faker may only be imported from src/lib/mock/seed/**.",
            },
          ],
        },
      ],
    },
  },

  // Seeding is the one place faker belongs.
  {
    files: ["src/lib/mock/seed/**"],
    rules: { "no-restricted-imports": "off" },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
