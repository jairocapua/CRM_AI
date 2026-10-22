import type { CDPSession, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Base UI's Select renders an `<input aria-hidden tabindex=-1>` right after
 * every trigger, for form submission and browser autofill
 * (node_modules/@base-ui/react/select/root/SelectRoot.mjs). The Browser pane's
 * read_page lists that input as a textbox named after the Select's value, which
 * reads like a stray, unlabelled control on every Select in the app.
 *
 * read_page walks the DOM with its own rules. Screen readers get Chromium's
 * accessibility tree instead, so this spec reads that tree through the Chrome
 * DevTools Protocol (CDP, the browser's debugging interface) and proves that
 * Chromium ignores each hidden input because of its own `aria-hidden`, while
 * the trigger next to it stays an exposed combobox. If a Base UI upgrade drops
 * the attribute, these tests go red (the self-test below shows they can).
 *
 * CDP is Chromium-only, which is fine: playwright.config.ts runs only the
 * chromium project.
 */

const TRIGGER = '[data-slot="select-trigger"]';

/**
 * The hidden input sits in the DOM straight after its trigger (the popup is
 * portalled away). The `-hidden-input` id is Base UI's own, and it sets it
 * only when the Select has no `name`: no Select in src passes one. If either
 * changes (a Base UI upgrade renames the id, or a `<Select name=...>` lands),
 * the count check in `selectAxProblems` fails with a mismatch rather than
 * passing on zero inputs; match the new markup here.
 */
const HIDDEN_INPUT = `${TRIGGER} ~ input[id$="-hidden-input"]`;

/** What Chromium's accessibility tree says about one DOM node. */
interface Ax {
  ignored: boolean;
  /** `ignoredReasons[].name`, e.g. "ariaHiddenElement". */
  reasons: string[];
  role?: string;
  name?: string;
}

interface SelectAxReport {
  triggers: Ax[];
  hiddenInputs: Ax[];
}

async function readAx(cdp: CDPSession, nodeId: number): Promise<Ax> {
  const { nodes } = await cdp.send("Accessibility.getPartialAXTree", {
    nodeId,
    fetchRelatives: false,
  });
  const node = nodes[0];
  if (!node) return { ignored: true, reasons: ["noAccessibilityNode"] };
  const role: unknown = node.role?.value;
  const name: unknown = node.name?.value;
  return {
    ignored: node.ignored,
    reasons: (node.ignoredReasons ?? []).map((reason) => reason.name),
    role: typeof role === "string" ? role : undefined,
    name: typeof name === "string" ? name : undefined,
  };
}

/**
 * Reads every Select trigger and hidden input inside `scope` (a CSS selector,
 * or the whole page) from Chromium's accessibility tree.
 */
async function readSelectAx(page: Page, scope = ""): Promise<SelectAxReport> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Accessibility.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    // Both queries back to back, right before reading: node ids go stale once
    // the document is replaced.
    const triggers = await cdp.send("DOM.querySelectorAll", {
      nodeId: root.nodeId,
      selector: `${scope} ${TRIGGER}`.trim(),
    });
    const hiddenInputs = await cdp.send("DOM.querySelectorAll", {
      nodeId: root.nodeId,
      selector: `${scope} ${HIDDEN_INPUT}`.trim(),
    });
    return {
      triggers: await Promise.all(
        triggers.nodeIds.map((id) => readAx(cdp, id)),
      ),
      hiddenInputs: await Promise.all(
        hiddenInputs.nodeIds.map((id) => readAx(cdp, id)),
      ),
    };
  } finally {
    await cdp.detach();
  }
}

function describeAx(ax: Ax): string {
  const reasons = ax.reasons.length > 0 ? ` (${ax.reasons.join(", ")})` : "";
  return `${ax.ignored ? "ignored" : "exposed"} ${ax.role ?? "(no role)"} named "${ax.name ?? ""}"${reasons}`;
}

/**
 * Everything wrong with a report, in plain English; `[]` when every hidden
 * input is ignored for its own aria-hidden and every trigger is a combobox.
 */
function selectAxProblems({
  triggers,
  hiddenInputs,
}: SelectAxReport): string[] {
  const problems: string[] = [];
  if (triggers.length === 0) {
    problems.push("found no Select triggers, so nothing was checked");
  }
  if (hiddenInputs.length !== triggers.length) {
    problems.push(
      `found ${triggers.length} Select trigger(s) but ${hiddenInputs.length} hidden input(s)`,
    );
  }
  hiddenInputs.forEach((input, i) => {
    if (!input.ignored) {
      problems.push(
        `hidden input ${i + 1} reaches screen readers as ${describeAx(input)}`,
      );
    } else if (!input.reasons.includes("ariaHiddenElement")) {
      // Ignored, but because of an ancestor or a modal, not Base UI's own
      // attribute: it would surface again outside that context.
      problems.push(
        `hidden input ${i + 1} is ${describeAx(input)}, not for its own aria-hidden`,
      );
    }
  });
  triggers.forEach((trigger, i) => {
    if (trigger.ignored || trigger.role !== "combobox") {
      problems.push(
        `Select trigger ${i + 1} is ${describeAx(trigger)}, expected an exposed combobox`,
      );
    }
  });
  return problems;
}

/**
 * Polls until every Select in `scope` passes. Polled, not read once, so
 * Chromium's accessibility tree can settle after a render.
 *
 * Polling does not wait for a Select that has not mounted yet: a trigger and
 * its hidden input mount in the same React commit, so the counts agree and the
 * poll can pass before a late Select arrives. Callers wait for every Select
 * they mean to check before calling this.
 */
async function expectHiddenInputsIgnored(
  page: Page,
  scope = "",
): Promise<void> {
  await expect
    .poll(async () => selectAxProblems(await readSelectAx(page, scope)), {
      message: `Select hidden inputs in ${scope || "the page"}`,
      timeout: 10_000,
    })
    .toEqual([]);
}

const ROUTES_WITH_A_SELECT = [
  "/dashboard",
  "/conversations",
  "/contacts",
  "/opportunities",
  "/calendars/availability",
];

for (const path of ROUTES_WITH_A_SELECT) {
  test(`${path}: Chromium ignores every Select's hidden input`, async ({
    page,
    gotoApp,
  }) => {
    await gotoApp(path);
    await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(page.locator(TRIGGER).first()).toBeVisible();

    await expectHiddenInputsIgnored(page);
  });
}

test("Add contact sheet: Chromium ignores every Select's hidden input", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/contacts");
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Add contact" });

  // Selects labelled through FieldLabel, controlled by react-hook-form, inside
  // a modal whose background is aria-hidden. The last three are the seeded
  // select-type custom fields, which mount only once
  // `api.customFields.list("contact")` resolves, after the built-in three.
  const selects = [
    "Status",
    "Source",
    "Owner",
    "Budget Range",
    "Company Size",
    "Preferred Contact Method",
  ];
  for (const name of selects) {
    await expect(
      sheet.getByRole("combobox", { name, exact: true }),
    ).toBeVisible();
  }
  // Exactly these, so the poll below checks each one and nothing unnamed.
  await expect(sheet.locator(TRIGGER)).toHaveCount(selects.length);

  await expectHiddenInputsIgnored(page, '[role="dialog"]');
});

test("self-test: an exposed hidden input is reported", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/dashboard");
  await expect(page.locator(TRIGGER).first()).toBeVisible();
  await expectHiddenInputsIgnored(page);

  // React leaves the attribute off afterwards: the prop never changes, so it
  // never rewrites it.
  await page
    .locator(HIDDEN_INPUT)
    .first()
    .evaluate((input) => input.removeAttribute("aria-hidden"));

  await expect
    .poll(
      async () => {
        const report = await readSelectAx(page);
        const exposed = report.hiddenInputs[0];
        return {
          problems: selectAxProblems(report).length,
          exposed: exposed && { ignored: exposed.ignored, role: exposed.role },
        };
      },
      { timeout: 10_000 },
    )
    .toEqual({ problems: 1, exposed: { ignored: false, role: "textbox" } });
});

test("self-test: no Selects, or a missing hidden input, is reported", () => {
  const combobox: Ax = { ignored: false, reasons: [], role: "combobox" };

  expect(selectAxProblems({ triggers: [], hiddenInputs: [] })).toEqual([
    "found no Select triggers, so nothing was checked",
  ]);
  expect(
    selectAxProblems({ triggers: [combobox, combobox], hiddenInputs: [] }),
  ).toEqual(["found 2 Select trigger(s) but 0 hidden input(s)"]);
});

test("a Select's hidden input hands focus to its trigger", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/dashboard");
  const trigger = page.getByRole("combobox", { name: "Pipeline" });
  await expect(trigger).toBeVisible();
  const input = page.locator(
    `${TRIGGER}[aria-label="Pipeline"] ~ input[id$="-hidden-input"]`,
  );
  await expect(input).toHaveCount(1);

  // Keyboard users never Tab onto it, and focus placed on it by script leaves
  // at once, so aria-hidden on a focusable element (axe's aria-hidden-focus)
  // does not bite.
  await expect(input).toHaveAttribute("tabindex", "-1");
  await input.focus();
  await expect(trigger).toBeFocused();
});
