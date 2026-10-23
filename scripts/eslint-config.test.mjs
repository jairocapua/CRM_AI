// Tests for the link-button rule in eslint.config.mjs. Run: node --test scripts/
//
// They lint snippets through the real config, at made-up paths, so a later
// config block that drops or overrides the rule shows up here.

import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** @type {ESLint} */
let eslint;

before(() => {
  eslint = new ESLint({ cwd: ROOT });
});

/**
 * The `no-restricted-syntax` messages for `code` linted as if it lived at
 * `relPath`. A parse error or an ignored file would yield no rule messages and
 * make a "no error" case pass by accident, so both fail the test instead.
 */
async function restricted(code, relPath) {
  const [result] = await eslint.lintText(code, {
    filePath: join(ROOT, relPath),
  });
  assert.ok(result, `no lint result for ${relPath}`);
  for (const message of result.messages) {
    assert.ok(!message.fatal, `${relPath}: ${message.message}`);
    assert.ok(message.ruleId, `${relPath}: ${message.message}`);
  }
  return result.messages.filter(
    (message) => message.ruleId === "no-restricted-syntax",
  );
}

const NATIVE_BUTTON_LINK = `import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Demo() {
  return (
    <Button render={<Link href="/contacts" />} nativeButton={false}>
      Contacts
    </Button>
  );
}
`;

const NATIVE_BUTTON_SPAN = `import { Button } from "@/components/ui/button";

export function Demo() {
  return (
    <Button render={<span />} nativeButton={false}>
      Open
    </Button>
  );
}
`;

const BARE_VARIANTS = `import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export function Demo() {
  return (
    <Link href="/contacts" className={buttonVariants({ variant: "outline" })}>
      Contacts
    </Link>
  );
}
`;

const MERGED_VARIANTS = `import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Demo() {
  return (
    <Link
      href="/contacts"
      className={cn(buttonVariants({ variant: "outline" }))}
    >
      Contacts
    </Link>
  );
}
`;

const LINK_BUTTON = `import { LinkButton } from "@/components/ui/button";

export function Demo() {
  return (
    <LinkButton href="/contacts" variant="outline">
      Contacts
    </LinkButton>
  );
}
`;

/** A non-link Button that sets `nativeButton` as `attribute` spells it. */
function nativeButtonCode(attribute) {
  return `import { Button } from "@/components/ui/button";

export function Demo() {
  return (
    <Button render={<span />} ${attribute}>
      Open
    </Button>
  );
}
`;
}

test("nativeButton={false} is an error in app code", async () => {
  for (const relPath of [
    "src/components/modules/demo/demo.tsx",
    "src/app/(app)/demo/page.tsx",
    "src/components/common/demo.tsx",
    "src/components/layout/demo.tsx",
  ]) {
    const messages = await restricted(NATIVE_BUTTON_LINK, relPath);
    assert.equal(messages.length, 1, relPath);
    assert.equal(messages[0].severity, 2, relPath);
    assert.match(messages[0].message, /LinkButton/, relPath);
    assert.match(messages[0].message, /CLAUDE\.md/, relPath);
  }

  // A blanket ban: a non-link element is flagged too, and disables the line
  // with a reason when it really is a button.
  const messages = await restricted(
    NATIVE_BUTTON_SPAN,
    "src/components/modules/demo/demo.tsx",
  );
  assert.equal(messages.length, 1);
});

test("a bare buttonVariants() className is an error; cn(buttonVariants()) and LinkButton are not", async () => {
  const relPath = "src/components/modules/demo/demo.tsx";

  const bare = await restricted(BARE_VARIANTS, relPath);
  assert.equal(bare.length, 1);
  assert.equal(bare[0].severity, 2);
  assert.match(bare[0].message, /cn\(\)/);
  assert.match(bare[0].message, /LinkButton/);
  assert.match(bare[0].message, /CLAUDE\.md/);

  assert.deepEqual(await restricted(MERGED_VARIANTS, relPath), []);
  assert.deepEqual(await restricted(LINK_BUTTON, relPath), []);
});

test("ui primitives are exempt; nativeButton true is allowed", async () => {
  for (const code of [NATIVE_BUTTON_LINK, BARE_VARIANTS]) {
    assert.deepEqual(await restricted(code, "src/components/ui/demo.tsx"), []);
  }

  for (const value of ["nativeButton", "nativeButton={true}"]) {
    assert.deepEqual(
      await restricted(
        nativeButtonCode(value),
        "src/components/modules/demo/demo.tsx",
      ),
      [],
      value,
    );
  }
});
