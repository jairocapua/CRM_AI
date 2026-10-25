import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * `/automation/[id]` draws the automation as a read-only React Flow diagram
 * above its step list, on screens 768px and wider (design §5). It can be
 * panned and zoomed with its Controls, nothing else; the wheel belongs to the
 * page. Below 768px React Flow is not mounted at all and the step list, which
 * renders at every width, is the whole picture.
 *
 * Speed to Lead is the one automation that forks: a trigger, three steps, a
 * fork with two branches of one step each, and an emitted End pill on each
 * branch, so 9 nodes and 8 edges.
 */

const SPEED_TO_LEAD = "/automation/wf_speed_to_lead";

const SPEED_TO_LEAD_NODES = [
  "trigger",
  "notify_sales",
  "send_sms",
  "wait_30_minutes",
  "replied",
  "assign_rep",
  "send_audit_email",
  "end:assign_rep",
  "end:send_audit_email",
];

/** The page's "Diagram" region. */
function diagram(page: Page): Locator {
  return page
    .getByRole("main")
    .getByRole("region", { name: "Diagram", exact: true });
}

/** The React Flow canvas inside it. */
function canvas(page: Page): Locator {
  return diagram(page).locator(".react-flow");
}

/** Waits for the detail page's reads to finish (no skeleton left). */
async function settled(page: Page): Promise<void> {
  await expect(
    page.getByRole("main").locator('[data-slot="skeleton"]'),
  ).toHaveCount(0, { timeout: 15_000 });
}

/**
 * A string only React Flow's own code holds (the id prefix of its hidden
 * node description), so a script response containing it is the diagram's
 * chunk. Chunk file names are content hashes, so the URL cannot tell.
 */
const REACT_FLOW_MARKER = "react-flow__node-desc";

/**
 * Starts recording the script responses that carry React Flow's code; the
 * returned function waits for their bodies and gives their URLs. Call it
 * before the navigation it should see.
 */
function watchReactFlowScripts(page: Page): () => Promise<string[]> {
  const found: Promise<string | null>[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() !== "script") return;
    found.push(
      response.text().then(
        (body) => (body.includes(REACT_FLOW_MARKER) ? response.url() : null),
        () => null,
      ),
    );
  });
  return async () =>
    (await Promise.all(found)).filter((url): url is string => url !== null);
}

/** The viewport's transform: what pan and zoom change. */
function viewportTransform(page: Page): Promise<string> {
  return canvas(page)
    .locator(".react-flow__viewport")
    .evaluate((el) => (el as HTMLElement).style.transform);
}

/** React Flow's viewport before `fitView` has run. */
const INITIAL_TRANSFORM = "translate(0px, 0px) scale(1)";

/**
 * Waits until the diagram has drawn its nodes and `fitView` has settled:
 * the viewport has left React Flow's initial transform and stopped moving.
 */
async function fitted(page: Page, nodeCount: number): Promise<void> {
  await expect(canvas(page).locator(".react-flow__node")).toHaveCount(
    nodeCount,
    { timeout: 15_000 },
  );
  let previous = "";
  await expect
    .poll(
      async () => {
        const now = await viewportTransform(page);
        const stable = now === previous && now !== INITIAL_TRANSFORM;
        previous = now;
        return stable;
      },
      { message: "fitView never settled", intervals: [100, 200, 200, 400] },
    )
    .toBe(true);
}

/**
 * How far the element that scrolls this page is scrolled: the nearest
 * scrollable ancestor of the diagram, else the document.
 */
function pageScrollTop(page: Page): Promise<number> {
  return canvas(page).evaluate((start) => {
    for (let el = start.parentElement; el; el = el.parentElement) {
      const { overflowY } = getComputedStyle(el);
      if (
        (overflowY === "auto" || overflowY === "scroll") &&
        el.scrollHeight > el.clientHeight
      ) {
        return el.scrollTop;
      }
    }
    return document.scrollingElement?.scrollTop ?? 0;
  });
}

test.describe("on a 1280x720 desktop", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("Speed to Lead draws 9 nodes and no two boxes overlap", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp(SPEED_TO_LEAD);
    await settled(page);
    await fitted(page, 9);

    const boxes = await canvas(page)
      .locator(".react-flow__node")
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return {
            id: (el as HTMLElement).dataset.id ?? "",
            x: r.x,
            y: r.y,
            w: r.width,
            h: r.height,
          };
        }),
      );
    expect(boxes.map((b) => b.id).sort()).toEqual(
      [...SPEED_TO_LEAD_NODES].sort(),
    );
    for (const b of boxes) {
      expect(b.w, b.id).toBeGreaterThan(0);
      expect(b.h, b.id).toBeGreaterThan(0);
    }
    // Pairwise AABB check; boxes that only touch do not count.
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        const overlap =
          a.x < b.x + b.w &&
          b.x < a.x + a.w &&
          a.y < b.y + b.h &&
          b.y < a.y + a.h;
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
    // The End pills are drawn short, against the laid-out 120x40 vs 260x78.
    const byId = new Map(boxes.map((b) => [b.id, b]));
    const end = byId.get("end:assign_rep")!;
    const card = byId.get("assign_rep")!;
    expect(end.w / card.w).toBeCloseTo(120 / 260, 2);
    expect(end.h / card.h).toBeCloseTo(40 / 78, 2);

    // Every edge draws; the fork's two leave from their branch's handle and
    // carry the branch label.
    await expect(canvas(page).locator(".react-flow__edge")).toHaveCount(8);
    const fork = canvas(page).locator('.react-flow__node[data-id="replied"]');
    for (const branch of ["b_replied", "b_silent"]) {
      await expect(
        fork.locator(`.react-flow__handle[data-handleid="${branch}"]`),
      ).toHaveCount(1);
    }
    const labels = await canvas(page)
      .locator(".react-flow__edge-text")
      .allTextContents();
    expect(labels.sort()).toEqual(["No reply", "Replied"]);
    await expect(fork).toContainText("Replied?");
    await expect(fork).toContainText(
      "Splits into 2 paths: Replied or No reply",
    );
  });

  test("the diagram is read-only: no dragging, selecting, keyboard hints or MiniMap, attribution kept", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp(SPEED_TO_LEAD);
    await settled(page);
    await fitted(page, 9);

    const flow = canvas(page);
    await expect(flow.locator(".react-flow__node.draggable")).toHaveCount(0);
    await expect(flow.locator(".react-flow__node.selectable")).toHaveCount(0);
    await expect(flow.locator(".react-flow__node[tabindex]")).toHaveCount(0);
    await expect(flow.locator(".react-flow__handle.connectable")).toHaveCount(
      0,
    );
    await expect(flow.locator(".react-flow__edge.animated")).toHaveCount(0);
    // Keyboard a11y is off (`disableKeyboardA11y`). Otherwise every node is
    // described by React Flow's hidden "Press enter or space to select a
    // node ... arrow keys to move ... delete to remove" text, and an
    // assertive live region (a div whose id starts `react-flow__aria-live`;
    // it has no class) is mounted to announce node moves: instructions a
    // screen reader would read out for things this diagram cannot do.
    await expect(
      flow.locator(".react-flow__node[aria-describedby]"),
    ).toHaveCount(0);
    await expect(
      flow.locator(".react-flow__edge[aria-describedby]"),
    ).toHaveCount(0);
    await expect(flow.locator('[id^="react-flow__aria-live"]')).toHaveCount(0);
    await expect(flow.locator("[aria-live]")).toHaveCount(0);
    await expect(flow.locator(".react-flow__minimap")).toHaveCount(0);
    await expect(flow.locator(".react-flow__attribution")).toHaveCount(1);
    // Zoom lives in the Controls, without the lock (interactive) toggle.
    await expect(flow.locator(".react-flow__controls-zoomin")).toHaveCount(1);
    await expect(flow.locator(".react-flow__controls-interactive")).toHaveCount(
      0,
    );

    // Dragging a node pans the canvas (panOnDrag) but never moves the node
    // relative to the others.
    const offset = () =>
      flow.evaluate((root) => {
        const box = (id: string) =>
          root
            .querySelector(`.react-flow__node[data-id="${id}"]`)!
            .getBoundingClientRect();
        return box("send_sms").y - box("trigger").y;
      });
    const before = await offset();
    const transform = await viewportTransform(page);
    const sms = flow.locator('.react-flow__node[data-id="send_sms"]');
    const box = (await sms.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height, {
      steps: 5,
    });
    await page.mouse.up();
    expect(await offset()).toBeCloseTo(before, 0);
    expect(await viewportTransform(page)).not.toBe(transform);
  });

  test("the mouse wheel over the diagram scrolls the page and does not zoom the canvas", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp(SPEED_TO_LEAD);
    await settled(page);
    await fitted(page, 9);

    // The page is taller than the window, so there is room to scroll.
    const room = await page.evaluate(() => {
      const el = document.scrollingElement!;
      return el.scrollHeight - el.clientHeight;
    });
    expect(room).toBeGreaterThan(300);

    const box = (await canvas(page).boundingBox())!;
    const viewportHeight = page.viewportSize()!.height;
    // A point on the canvas that is on screen.
    const x = box.x + box.width / 2;
    const y = box.y + Math.min(box.height, viewportHeight - box.y) / 2;
    await page.mouse.move(x, y);
    const transform = await viewportTransform(page);
    const scrolled = await pageScrollTop(page);

    await page.mouse.wheel(0, 300);

    await expect.poll(() => pageScrollTop(page)).toBeGreaterThan(scrolled);
    expect(await viewportTransform(page)).toBe(transform);
  });

  test("React Flow's code is fetched once the diagram mounts", async ({
    page,
    gotoApp,
  }) => {
    // The control for the phone test below: it proves the marker finds the
    // diagram's chunk when there is one.
    const reactFlowScripts = watchReactFlowScripts(page);
    await gotoApp(SPEED_TO_LEAD);
    await settled(page);
    await fitted(page, 9);
    expect(await reactFlowScripts()).toHaveLength(1);
  });

  test.describe("switching from light to dark", () => {
    // Starts light on purpose: the test then switches to dark itself.
    test.use({ colorScheme: "light" });

    test("nodes, edges and controls follow the theme", async ({
      page,
      gotoApp,
    }) => {
      await gotoApp(SPEED_TO_LEAD);
      await settled(page);
      await fitted(page, 9);

      /** The diagram's colours, beside the theme tokens they should be. */
      const colours = () =>
        canvas(page).evaluate((flow) => {
          const token = (name: string) => {
            const probe = document.createElement("div");
            probe.style.color = `var(${name})`;
            flow.appendChild(probe);
            const value = getComputedStyle(probe).color;
            probe.remove();
            return value;
          };
          const node = flow.querySelector(
            '.react-flow__node[data-id="notify_sales"] > div',
          )!;
          const edge = flow.querySelector(".react-flow__edge-path")!;
          const control = flow.querySelector(".react-flow__controls-button")!;
          return {
            node: getComputedStyle(node).backgroundColor,
            nodeText: getComputedStyle(node).color,
            edge: getComputedStyle(edge).stroke,
            control: getComputedStyle(control).backgroundColor,
            controlIcon: getComputedStyle(control).color,
            canvas: getComputedStyle(flow).backgroundColor,
            card: token("--card"),
            cardForeground: token("--card-foreground"),
            foreground: token("--foreground"),
            mutedForeground: token("--muted-foreground"),
            background: token("--background"),
          };
        });

      const expectThemed = (c: Awaited<ReturnType<typeof colours>>) => {
        expect(c.node, "node background").toBe(c.card);
        expect(c.nodeText, "node text").toBe(c.cardForeground);
        expect(c.edge, "edge stroke").toBe(c.mutedForeground);
        expect(c.control, "control background").toBe(c.card);
        expect(c.controlIcon, "control icon").toBe(c.foreground);
        expect(c.canvas, "canvas").toBe(c.background);
      };

      await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
      const light = await colours();
      expectThemed(light);

      await page.getByRole("button", { name: "Change theme" }).click();
      await page.getByRole("menuitemradio", { name: "Dark" }).click();
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);

      const dark = await colours();
      expectThemed(dark);
      expect(dark.node).not.toBe(light.node);
      expect(dark.edge).not.toBe(light.edge);
      expect(dark.control).not.toBe(light.control);
      expect(dark.controlIcon).not.toBe(light.controlIcon);
    });
  });
});

test.describe("on a 375px phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("React Flow is neither mounted nor downloaded while the step list renders", async ({
    page,
    gotoApp,
  }) => {
    const reactFlowScripts = watchReactFlowScripts(page);
    await gotoApp(SPEED_TO_LEAD);
    await settled(page);
    await expect(
      page.getByRole("main").getByRole("list", { name: "Steps", exact: true }),
    ).toBeVisible();
    // The diagram would mount in the same render as the step list, and that
    // render is what requests its chunk; waiting for the network to go quiet
    // lets such a request finish before the checks below.
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".react-flow")).toHaveCount(0);
    await expect(diagram(page)).toHaveCount(0);
    expect(await reactFlowScripts()).toEqual([]);
  });
});
