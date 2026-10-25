import { describe, expect, it } from "vitest";

import { ApiError, type UserReferenceCounts } from "@/lib/api";
import {
  followsSentence,
  lastSeenLabel,
  lastSeenLine,
  memberStatusLabel,
  movesAnything,
  removalSummary,
  removedDescription,
  ROLE_LABELS,
  serverErrorField,
} from "./team-copy";

const NONE: UserReferenceCounts = {
  contacts: 0,
  opportunities: 0,
  tasks: 0,
  conversations: 0,
  appointments: 0,
  calendars: 0,
  smartLists: 0,
  follows: 0,
};

describe("ROLE_LABELS and memberStatusLabel()", () => {
  it("reads every role and status in plain words", () => {
    expect(ROLE_LABELS).toEqual({
      agency_owner: "Agency owner",
      admin: "Admin",
      user: "User",
    });
    expect(memberStatusLabel("active")).toBe("Active");
    expect(memberStatusLabel("pending")).toBe("Pending");
  });
});

describe("lastSeenLabel()", () => {
  const now = new Date("2026-10-20T12:00:00.000Z");

  it("measures from the clock it is given", () => {
    expect(lastSeenLabel("2026-10-20T11:55:00.000Z", now)).toBe(
      "5 minutes ago",
    );
    expect(lastSeenLabel("2026-10-18T12:00:00.000Z", now)).toBe("2 days ago");
  });

  it("says Never signed in for someone with no last seen", () => {
    expect(lastSeenLabel(undefined, now)).toBe("Never signed in");
  });

  it("reads as a line of its own on a phone", () => {
    expect(lastSeenLine("2026-10-20T11:55:00.000Z", now)).toBe(
      "Last seen 5 minutes ago",
    );
    expect(lastSeenLine(undefined, now)).toBe("Never signed in");
  });
});

describe("removalSummary()", () => {
  it("says there is nothing when every count is zero, follows aside", () => {
    expect(removalSummary(NONE, "Jordan Reyes")).toBe("Nothing to reassign.");
    expect(removalSummary({ ...NONE, follows: 4 }, "Jordan Reyes")).toBe(
      "Nothing to reassign.",
    );
  });

  it("names one kind, singular", () => {
    expect(removalSummary({ ...NONE, contacts: 1 }, "Jordan Reyes")).toBe(
      "1 contact moves to Jordan Reyes.",
    );
  });

  it("names one kind, plural, with a plural verb", () => {
    expect(removalSummary({ ...NONE, contacts: 2 }, "Jordan Reyes")).toBe(
      "2 contacts move to Jordan Reyes.",
    );
  });

  it("names two kinds with and", () => {
    expect(
      removalSummary({ ...NONE, contacts: 2, opportunities: 1 }, "Priya Nair"),
    ).toBe("2 contacts and 1 deal move to Priya Nair.");
  });

  it("names every non-zero kind in order and skips the zero ones", () => {
    expect(
      removalSummary(
        {
          contacts: 3,
          opportunities: 0,
          tasks: 2,
          conversations: 1,
          appointments: 2,
          calendars: 2,
          smartLists: 1,
          follows: 9,
        },
        "Jordan Reyes",
      ),
    ).toBe(
      "3 contacts, 2 tasks, 1 conversation, 2 appointments, 2 calendar seats and 1 private smart list move to Jordan Reyes.",
    );
  });
});

describe("movesAnything()", () => {
  it("is true when any record moves, never for follows alone", () => {
    expect(movesAnything(NONE)).toBe(false);
    expect(movesAnything({ ...NONE, follows: 3 })).toBe(false);
    expect(movesAnything({ ...NONE, smartLists: 1 })).toBe(true);
    expect(movesAnything({ ...NONE, calendars: 1 })).toBe(true);
  });
});

describe("removedDescription()", () => {
  it("says where the records went only when something moved", () => {
    expect(removedDescription({ ...NONE, contacts: 1 }, "Priya Nair")).toBe(
      "Their records now belong to Priya Nair.",
    );
    expect(removedDescription({ ...NONE, calendars: 2 }, "Jordan Reyes")).toBe(
      "Their records now belong to Jordan Reyes.",
    );
    expect(removedDescription(NONE, "Jordan Reyes")).toBeUndefined();
    expect(
      removedDescription({ ...NONE, follows: 3 }, "Jordan Reyes"),
    ).toBeUndefined();
  });
});

describe("followsSentence()", () => {
  it("says follows are dropped, with the count when there are some", () => {
    expect(followsSentence(0, "Casey")).toBe("Follows are dropped, not moved.");
    expect(followsSentence(1, "Casey")).toBe(
      "Follows are dropped, not moved: Casey follows 1 contact.",
    );
    expect(followsSentence(2, "Casey")).toBe(
      "Follows are dropped, not moved: Casey follows 2 contacts.",
    );
  });
});

describe("serverErrorField()", () => {
  const FIELDS = ["firstName", "email"] as const;

  it("names the form field a refusal is about", () => {
    expect(
      serverErrorField(
        new ApiError("Taken.", 409, "EMAIL_TAKEN", "email"),
        FIELDS,
      ),
    ).toBe("email");
  });

  it("is null for a field the form lacks, no field, or not an ApiError", () => {
    expect(
      serverErrorField(new ApiError("No.", 422, "X", "role"), FIELDS),
    ).toBeNull();
    expect(
      serverErrorField(new ApiError("Network.", 503, "MOCK_FAILURE"), FIELDS),
    ).toBeNull();
    expect(serverErrorField(new Error("boom"), FIELDS)).toBeNull();
    expect(serverErrorField(undefined, FIELDS)).toBeNull();
  });
});
