import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { VariantProps } from "class-variance-authority";

import { Button, buttonVariants, LinkButton } from "./button";
import {
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./pagination";

/**
 * A control that navigates must stay a link: an `<a href>` with no role, so a
 * screen reader announces "link". And it must look exactly like the Button it
 * replaces, which means the same `cn()`-merged classes. These tests render
 * the components to static HTML (no DOM needed) and read the root element.
 */

type Variant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
type Size = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

const VARIANTS = [
  "default",
  "outline",
  "secondary",
  "ghost",
  "destructive",
  "link",
] as const satisfies readonly Variant[];

const SIZES = [
  "default",
  "xs",
  "sm",
  "lg",
  "icon",
  "icon-xs",
  "icon-sm",
  "icon-lg",
] as const satisfies readonly Size[];

interface Root {
  tag: string;
  attributes: Record<string, string>;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#x27;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

/** Renders to static HTML and reads the root element's tag and attributes. */
function render(element: ReactElement): Root {
  const markup = renderToStaticMarkup(element);
  const match = /^<([a-z][a-z0-9]*)([^>]*)>/.exec(markup);
  if (!match) throw new Error(`No root element in: ${markup}`);
  const [, tag = "", source = ""] = match;
  const attributes: Record<string, string> = {};
  for (const [, name = "", value = ""] of source.matchAll(
    /([^\s=]+)(?:="([^"]*)")?/g,
  )) {
    attributes[name] = value.replace(
      /&(?:amp|quot|#x27|lt|gt);/g,
      (entity) => ENTITIES[entity] ?? entity,
    );
  }
  return { tag, attributes };
}

function classList(element: Root): string[] {
  return (element.attributes.class ?? "").split(/\s+/);
}

describe("LinkButton", () => {
  it("lists every variant and size", () => {
    // The guard is this expectTypeOf pair, and it fails under
    // `npm run typecheck`, not Vitest: Vitest strips types, so at run time
    // these calls do nothing and this test always passes. Each line stops
    // compiling when buttonVariants gains a variant or size that the parity
    // loop below would miss.
    expectTypeOf<Exclude<Variant, (typeof VARIANTS)[number]>>().toBeNever();
    expectTypeOf<Exclude<Size, (typeof SIZES)[number]>>().toBeNever();
  });

  it("renders a plain link: an <a href> with no role", () => {
    const link = render(h(LinkButton, { href: "/contacts/1" }, "View contact"));

    expect(link.tag).toBe("a");
    expect(link.attributes.href).toBe("/contacts/1");
    expect(link.attributes).not.toHaveProperty("role");
    expect(link.attributes["data-slot"]).toBe("link-button");
  });

  it('Base UI\'s Button marks a rendered <a> role="button" (why LinkButton exists)', () => {
    const button = render(
      h(Button, { render: h("a", { href: "/x" }), nativeButton: false }, "Go"),
    );

    expect(button.tag).toBe("a");
    expect(button.attributes.role).toBe("button");
  });

  it("has the same classes as Button for every variant and size", () => {
    for (const variant of VARIANTS) {
      for (const size of SIZES) {
        for (const className of [undefined, "h-10 ml-auto"]) {
          const button = render(h(Button, { variant, size, className }, "Go"));
          const link = render(
            h(LinkButton, { href: "/x", variant, size, className }, "Go"),
          );
          expect(
            link.attributes.class,
            `${variant} / ${size} / ${className ?? "no className"}`,
          ).toBe(button.attributes.class);
        }
      }
    }
  });

  it("defaults to Button's default variant and size", () => {
    const button = render(h(Button, {}, "Go"));
    const link = render(h(LinkButton, { href: "/x" }, "Go"));

    expect(link.attributes.class).toBe(button.attributes.class);
  });

  it("outline sm keeps its border and 8px radius", () => {
    const link = classList(
      render(
        h(LinkButton, { href: "/x", variant: "outline", size: "sm" }, "Go"),
      ),
    );

    expect(link).toContain("border-border");
    expect(link).toContain("rounded-[min(var(--radius-md),12px)]");
    expect(link).not.toContain("border-transparent");
    expect(link).not.toContain("rounded-lg");
  });
});

describe("PaginationLink", () => {
  it("is a link, not a button", () => {
    const active = render(
      h(PaginationLink, { href: "?page=2", isActive: true }, "2"),
    );
    const inactive = render(h(PaginationLink, { href: "?page=3" }, "3"));

    expect(active.tag).toBe("a");
    expect(active.attributes.href).toBe("?page=2");
    expect(active.attributes).not.toHaveProperty("role");
    expect(active.attributes["aria-current"]).toBe("page");

    expect(inactive.tag).toBe("a");
    expect(inactive.attributes).not.toHaveProperty("role");
    expect(inactive.attributes).not.toHaveProperty("aria-current");
  });

  it("active is the outline icon button, inactive the ghost icon button", () => {
    const active = render(
      h(PaginationLink, { href: "?page=2", isActive: true }),
    );
    const inactive = render(h(PaginationLink, { href: "?page=3" }));

    expect(active.attributes.class).toBe(
      render(h(Button, { variant: "outline", size: "icon" })).attributes.class,
    );
    expect(inactive.attributes.class).toBe(
      render(h(Button, { variant: "ghost", size: "icon" })).attributes.class,
    );

    const previous = render(h(PaginationPrevious, { href: "?page=1" }));
    const next = render(h(PaginationNext, { href: "?page=3" }));
    const ghost = (className: string) =>
      render(h(Button, { variant: "ghost", size: "default", className }))
        .attributes.class;

    expect(previous.tag).toBe("a");
    expect(previous.attributes).not.toHaveProperty("role");
    expect(previous.attributes.class).toBe(ghost("pl-1.5!"));
    expect(next.tag).toBe("a");
    expect(next.attributes).not.toHaveProperty("role");
    expect(next.attributes.class).toBe(ghost("pr-1.5!"));
  });
});
