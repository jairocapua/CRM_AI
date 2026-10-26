import { describe, expect, it } from "vitest";
import {
  PhoneIncomingIcon,
  PhoneMissedIcon,
  PhoneOutgoingIcon,
  VoicemailIcon,
} from "lucide-react";

import type { Message } from "@/types";
import { callKind } from "./call-kind";

function call(patch: Partial<Message>): Message {
  return {
    id: "msg_1",
    conversationId: "cnv_1",
    channel: "call",
    direction: "inbound",
    status: "delivered",
    body: "",
    attachments: [],
    sentAt: "2026-10-01T09:00:00.000Z",
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-01T09:00:00.000Z",
    ...patch,
  } as Message;
}

const ANSWERED = { durationSec: 125, missed: false };
const MISSED = { durationSec: 0, missed: true };

describe("callKind", () => {
  it.each([
    [
      "inbound call",
      { direction: "inbound", callMeta: ANSWERED },
      PhoneIncomingIcon,
      "Inbound call",
      false,
      "2m 05s",
    ],
    [
      "outbound call",
      { direction: "outbound", callMeta: ANSWERED },
      PhoneOutgoingIcon,
      "Outbound call",
      false,
      "2m 05s",
    ],
    [
      "missed inbound",
      { direction: "inbound", callMeta: MISSED },
      PhoneMissedIcon,
      "Missed call",
      true,
      null,
    ],
    [
      "missed outbound",
      { direction: "outbound", callMeta: MISSED },
      PhoneMissedIcon,
      "Missed call",
      true,
      null,
    ],
    [
      "call with no meta",
      { direction: "inbound" },
      PhoneIncomingIcon,
      "Inbound call",
      false,
      null,
    ],
    [
      "voicemail",
      { channel: "voicemail", callMeta: { durationSec: 40, missed: false } },
      VoicemailIcon,
      "Voicemail",
      false,
      "40s",
    ],
    // Voicemail wins over missed for the icon and label, as before.
    [
      "missed voicemail",
      { channel: "voicemail", callMeta: MISSED },
      VoicemailIcon,
      "Voicemail",
      true,
      null,
    ],
  ] as const)("%s", (_, patch, icon, label, missed, duration) => {
    const kind = callKind(call(patch as Partial<Message>));
    expect(kind.Icon).toBe(icon);
    expect(kind.label).toBe(label);
    expect(kind.missed).toBe(missed);
    expect(kind.duration).toBe(duration);
  });
});
