import { describe, expect, it } from "vitest";

import {
  EMPTY_AUTOMATION_REQUEST,
  automationRequestSchema,
} from "./automation-request";

describe("automationRequestSchema", () => {
  it("gives every blank field its own message", () => {
    const result = automationRequestSchema.safeParse({
      ...EMPTY_AUTOMATION_REQUEST,
      title: "   ",
    });
    expect(result.success).toBe(false);
    const messages = Object.fromEntries(
      result.error!.issues.map((i) => [i.path.join("."), i.message]),
    );
    expect(messages).toEqual({
      title: "Give the request a title.",
      problem: "Say what goes wrong today.",
      trigger: "Say what should start it.",
      outcome: "Say what should happen.",
    });
  });

  it("trims text, defaults to normal priority and refuses another", () => {
    const filled = {
      title: " Thank customers ",
      problem: "p",
      trigger: "t",
      outcome: "o",
    };
    expect(
      automationRequestSchema.parse({ ...EMPTY_AUTOMATION_REQUEST, ...filled }),
    ).toEqual({
      title: "Thank customers",
      problem: "p",
      trigger: "t",
      outcome: "o",
      priority: "normal",
    });
    expect(
      automationRequestSchema.safeParse({ ...filled, priority: "urgent" })
        .success,
    ).toBe(false);
  });
});
