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

/**
 * Links drawn as buttons are `<LinkButton>`; why is in its JSDoc
 * (src/components/ui/button.tsx). This rule rejects the two spellings that
 * break one: `nativeButton={false}` and a bare
 * `className={buttonVariants(...)}`. ui primitives (shadcn vendor code) are
 * exempt. scripts/eslint-config.test.mjs lints snippets through this config
 * to prove the selectors fire.
 */
const LINK_BUTTON_RULE = [
  "error",
  {
    selector:
      'JSXAttribute[name.name="nativeButton"][value.expression.value=false]',
    message:
      'nativeButton={false} makes Base UI add role="button", so a link is announced as a button. A navigating control is <LinkButton> from @/components/ui/button. A non-link element that really is a button may keep it, and so may a Base UI trigger (Menu, Popover, Dialog, Select) that renders a non-button element: disable this line with a reason (eslint-disable-next-line no-restricted-syntax -- why). See CLAUDE.md.',
  },
  {
    selector:
      'JSXAttribute[name.name="className"] > JSXExpressionContainer > CallExpression[callee.name="buttonVariants"]',
    message:
      "Wrap buttonVariants() in cn(), or use <LinkButton>: the raw string keeps conflicting classes (border-transparent hides the outline border in light mode). See CLAUDE.md.",
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

  // Links drawn as buttons are <LinkButton> (see LINK_BUTTON_RULE).
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/**"],
    rules: { "no-restricted-syntax": LINK_BUTTON_RULE },
  },

  // Playwright fixtures hand each setup callback a `use(value)` function, which
  // eslint-config-next's rules-of-hooks mistakes for React's `use` hook.
  {
    files: ["e2e/**", "playwright.config.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    // Saved workflow scripts use top-level await/return and run in Claude
    // Code's workflow runtime, not Node.
    ".claude/workflows/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
