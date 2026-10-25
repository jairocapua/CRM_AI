import type { CDPSession, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Base UI's Select renders an `<input aria-hidden tabindex=-1>` right after
 * every trigger, for form submission and browser autofill
 * (node_modules/@base-ui/react/select/root/SelectRoot.mjs), and its Combobox
 * renders one too. The Browser pane's read_page lists that input as a textbox
 * named after the control's value, which reads like a stray, unlabelled
 * control on every Select in the app.
 *
 * read_page walks the DOM with its own rules. Screen readers get Chromium's
 * accessibility tree instead, so this spec reads that tree through the Chrome
 * DevTools Protocol (CDP, the browser's debugging interface) and proves that
 * Chromium ignores each hidden input because of its own `aria-hidden`, while
 * the trigger next to it stays an exposed combobox with a non-empty name. Each
 * test pins the names it expects, so a missing, extra or nameless trigger
 * fails. The TagPicker cases (the Add contact sheet, the deal sheet, the
 * contacts toolbar and the bulk Tags popover) check a Combobox, so CLAUDE.md's
 * "Select and Combobox" note is proven, not assumed. If a Base UI
 * upgrade drops the attribute, these tests go red (the self-tests below show
 * they can).
 *
 * CDP is Chromium-only, which is fine: playwright.config.ts runs only the
 * chromium project.
 */

const TRIGGER = '[data-slot="select-trigger"]';

/** One kind of Base UI control whose hidden input this spec checks. */
interface Control {
  /** What the problem messages call it. */
  noun: "Select" | "Combobox";
  /** The element that carries `role="combobox"`. */
  trigger: string;
  /** Base UI's hidden input for each trigger. */
  hiddenInput: string;
}

/**
 * The hidden input sits in the DOM straight after its trigger (the popup is
 * portalled away). The `-hidden-input` id is Base UI's own, and it sets it
 * only when the Select has no `name`: no Select in src passes one. If either
 * changes (a Base UI upgrade renames the id, or a `<Select name=...>` lands),
 * the count check in `controlAxProblems` fails with a mismatch rather than
 * passing on zero inputs; match the new markup here.
 */
const SELECT: Control = {
  noun: "Select",
  trigger: TRIGGER,
  hiddenInput: `${TRIGGER} ~ input[id$="-hidden-input"]`,
};

/**
 * A chips Combobox such as the TagPicker. Its `role="combobox"` element is the
 * text input. Base UI's Combobox Root renders no element of its own and adds
 * its hidden input after its children (the `${id}-hidden-input` id expression
 * in node_modules/@base-ui/react/combobox/root/AriaCombobox.mjs), so the
 * hidden input comes after the chips div, in the same parent. If a Base UI
 * upgrade changes this, the count check fails with a mismatch.
 */
const TAG_COMBOBOX: Control = {
  noun: "Combobox",
  trigger: '[data-slot="combobox-chip-input"]',
  hiddenInput: '[data-slot="combobox-chips"] ~ input[id$="-hidden-input"]',
};

/** What Chromium's accessibility tree says about one DOM node. */
interface Ax {
  ignored: boolean;
  /** `ignoredReasons[].name`, e.g. "ariaHiddenElement". */
  reasons: string[];
  role?: string;
  name?: string;
}

interface ControlAxReport {
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
 * Reads every trigger and hidden input of `control` inside `scope` (a CSS
 * selector, or the whole page) from Chromium's accessibility tree, in page
 * order.
 */
async function readControlAx(
  page: Page,
  control: Control,
  scope = "",
): Promise<ControlAxReport> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Accessibility.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    // Both queries back to back, right before reading: node ids go stale once
    // the document is replaced.
    const triggers = await cdp.send("DOM.querySelectorAll", {
      nodeId: root.nodeId,
      selector: `${scope} ${control.trigger}`.trim(),
    });
    const hiddenInputs = await cdp.send("DOM.querySelectorAll", {
      nodeId: root.nodeId,
      selector: `${scope} ${control.hiddenInput}`.trim(),
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
 * input is ignored for its own aria-hidden and every trigger is an exposed
 * combobox with a non-empty name.
 */
function controlAxProblems(
  { noun }: Control,
  { triggers, hiddenInputs }: ControlAxReport,
): string[] {
  const problems: string[] = [];
  if (triggers.length === 0) {
    problems.push(`found no ${noun} triggers, so nothing was checked`);
  }
  if (hiddenInputs.length !== triggers.length) {
    problems.push(
      `found ${triggers.length} ${noun} trigger(s) but ${hiddenInputs.length} hidden input(s)`,
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
        `${noun} trigger ${i + 1} is ${describeAx(trigger)}, expected an exposed combobox`,
      );
    } else if (!trigger.name?.trim()) {
      problems.push(
        `${noun} trigger ${i + 1} is ${describeAx(trigger)}, expected a non-empty name`,
      );
    }
  });
  return problems;
}

/**
 * Checks that `scope` (a CSS selector, or the whole page) holds exactly the
 * triggers of `control` named `names`, in page order, and that each one passes
 * `controlAxProblems`.
 *
 * It waits for every name by role first. That is what makes an expected
 * Select that mounts late get waited for: a trigger and its hidden input mount
 * in the same React commit, so the counts always agree and a poll alone could
 * pass before a late Select arrives. The trigger count is then checked once,
 * after those named triggers are present, so an extra Select that mounts after
 * that moment is not caught. Then Chromium's own names (read through CDP) must
 * equal the list. The CDP read is polled, not read once, so the accessibility
 * tree can settle after a render.
 */
async function expectNamedControls(
  page: Page,
  names: string[],
  { scope = "", control = SELECT }: { scope?: string; control?: Control } = {},
): Promise<void> {
  const root = scope ? page.locator(scope) : page;
  for (const name of names) {
    await expect(
      root.getByRole("combobox", { name, exact: true }),
    ).toBeVisible();
  }
  await expect(root.locator(control.trigger)).toHaveCount(names.length);

  await expect
    .poll(
      async () => {
        const report = await readControlAx(page, control, scope);
        return {
          names: report.triggers.map((trigger) => trigger.name ?? ""),
          problems: controlAxProblems(control, report),
        };
      },
      {
        message: `${control.noun} triggers in ${scope || "the page"}`,
        timeout: 10_000,
      },
    )
    .toEqual({ names, problems: [] });
}

/** Every Select each route shows once it has loaded, in page order. */
const ROUTES_WITH_A_SELECT: { path: string; names: string[] }[] = [
  { path: "/dashboard", names: ["Pipeline"] },
  { path: "/conversations", names: ["Filter by channel"] },
  { path: "/contacts", names: ["Status"] },
  { path: "/opportunities", names: ["Pipeline"] },
  { path: "/calendars/availability", names: ["Calendar"] },
];

for (const { path, names } of ROUTES_WITH_A_SELECT) {
  test(`${path}: every Select is named and its hidden input ignored`, async ({
    page,
    gotoApp,
  }) => {
    await gotoApp(path);
    await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0, {
      timeout: 15_000,
    });

    await expectNamedControls(page, names);
  });
}

test("Add contact sheet: every Select is named and its hidden input ignored", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/contacts");
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Add contact" })).toBeVisible();

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
  await expectNamedControls(page, selects, { scope: '[role="dialog"]' });
});

test("Add contact sheet: the TagPicker Combobox is named and its hidden input ignored", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/contacts");
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Add contact" })).toBeVisible();

  // Named by the sheet's `FieldLabel htmlFor="tagIds"`, not its placeholder,
  // which empties once a tag is picked.
  await expectNamedControls(page, ["Tags"], {
    scope: '[role="dialog"]',
    control: TAG_COMBOBOX,
  });
});

test("Bulk actions Owner popover: its Select is named and its hidden input ignored", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/contacts");
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0, {
    timeout: 15_000,
  });

  // The popover's Select mounts only once a row is selected and Owner is
  // opened. The Owner column header is not sortable, so it is not a button.
  await page.getByRole("checkbox", { name: "Select row" }).first().click();
  await page.getByRole("button", { name: "Owner", exact: true }).click();

  await expectNamedControls(page, ["Assign owner"], {
    scope: '[data-slot="popover-content"]',
  });
});

test("Deal sheet: the TagPicker Combobox is named and its hidden input ignored", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/opportunities");
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0, {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "New deal", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "New deal" })).toBeVisible();

  // Named by the sheet's `FieldLabel htmlFor="tagIds"`, not its placeholder.
  // The sheet's ContactPicker is a plain combobox input, not a chips input, so
  // TAG_COMBOBOX does not match it.
  await expectNamedControls(page, ["Tags"], {
    scope: '[role="dialog"]',
    control: TAG_COMBOBOX,
  });
});

test("Contacts toolbar: the tag filter and the search box are named", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/contacts");
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0, {
    timeout: 15_000,
  });

  // The whole page is the scope: no other chips Combobox is mounted until a
  // popover or sheet opens. Without an aria-label, both names would fall back
  // to the placeholders ("Add tags…", "Search contacts…").
  await expectNamedControls(page, ["Filter by tags"], {
    control: TAG_COMBOBOX,
  });
  const search = page.getByRole("textbox", {
    name: "Search contacts",
    exact: true,
  });
  await expect(search).toBeVisible();
  await expect(search).toHaveAccessibleName("Search contacts");
});

test("Bulk actions Tags popover: its TagPicker is named and its hidden input ignored", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/contacts");
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0, {
    timeout: 15_000,
  });

  // The popover's TagPicker mounts only once a row is selected and Tags is
  // opened. The Tags column header is not sortable, so it is not a button; if
  // it ever becomes one, this click turns ambiguous.
  await page.getByRole("checkbox", { name: "Select row" }).first().click();
  await page.getByRole("button", { name: "Tags", exact: true }).click();

  await expectNamedControls(page, ["Tags"], {
    scope: '[data-slot="popover-content"]',
    control: TAG_COMBOBOX,
  });
});

test("self-test: an exposed hidden input is reported", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/dashboard");
  await expectNamedControls(page, ["Pipeline"]);

  // React leaves the attribute off afterwards: the prop never changes, so it
  // never rewrites it.
  await page
    .locator(SELECT.hiddenInput)
    .first()
    .evaluate((input) => input.removeAttribute("aria-hidden"));

  await expect
    .poll(
      async () => {
        const report = await readControlAx(page, SELECT);
        const exposed = report.hiddenInputs[0];
        return {
          problems: controlAxProblems(SELECT, report).length,
          exposed: exposed && { ignored: exposed.ignored, role: exposed.role },
        };
      },
      { timeout: 10_000 },
    )
    .toEqual({ problems: 1, exposed: { ignored: false, role: "textbox" } });
});

test("self-test: a nameless trigger is reported", async ({ page, gotoApp }) => {
  await gotoApp("/dashboard");
  await expectNamedControls(page, ["Pipeline"]);

  // As above, React does not put the attribute back.
  await page
    .locator(`${TRIGGER}[aria-label="Pipeline"]`)
    .evaluate((trigger) => trigger.removeAttribute("aria-label"));

  await expect
    .poll(
      async () => controlAxProblems(SELECT, await readControlAx(page, SELECT)),
      { timeout: 10_000 },
    )
    .toEqual([
      'Select trigger 1 is exposed combobox named "", expected a non-empty name',
    ]);
});

test("self-test: no triggers, a missing hidden input or a nameless trigger is reported", () => {
  const combobox: Ax = {
    ignored: false,
    reasons: [],
    role: "combobox",
    name: "Status",
  };
  const hiddenInput: Ax = { ignored: true, reasons: ["ariaHiddenElement"] };

  expect(controlAxProblems(SELECT, { triggers: [], hiddenInputs: [] })).toEqual(
    ["found no Select triggers, so nothing was checked"],
  );
  expect(
    controlAxProblems(TAG_COMBOBOX, { triggers: [], hiddenInputs: [] }),
  ).toEqual(["found no Combobox triggers, so nothing was checked"]);
  expect(
    controlAxProblems(SELECT, {
      triggers: [combobox, combobox],
      hiddenInputs: [],
    }),
  ).toEqual(["found 2 Select trigger(s) but 0 hidden input(s)"]);
  expect(
    controlAxProblems(SELECT, {
      triggers: [combobox],
      hiddenInputs: [hiddenInput],
    }),
  ).toEqual([]);

  const nameless: Ax = { ignored: false, reasons: [], role: "combobox" };
  expect(
    controlAxProblems(SELECT, {
      triggers: [nameless],
      hiddenInputs: [hiddenInput],
    }),
  ).toEqual([
    'Select trigger 1 is exposed combobox named "", expected a non-empty name',
  ]);
  expect(
    controlAxProblems(SELECT, {
      triggers: [{ ...nameless, name: "  " }],
      hiddenInputs: [hiddenInput],
    }),
  ).toEqual([
    'Select trigger 1 is exposed combobox named "  ", expected a non-empty name',
  ]);
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
