import {
  PhoneIncomingIcon,
  PhoneMissedIcon,
  PhoneOutgoingIcon,
  VoicemailIcon,
  type LucideIcon,
} from "lucide-react";

import type { Message } from "@/types";
import { formatDuration } from "@/lib/format";

export interface CallKind {
  Icon: LucideIcon;
  label: string;
  /** Tints the icon; a voicemail can be missed too. */
  missed: boolean;
  /** Formatted length of an answered call or voicemail, else null. */
  duration: string | null;
}

/** How a call or voicemail entry in the thread reads. */
export function callKind(message: Message): CallKind {
  const missed = message.callMeta?.missed ?? false;
  const kind =
    message.channel === "voicemail"
      ? { Icon: VoicemailIcon, label: "Voicemail" }
      : missed
        ? { Icon: PhoneMissedIcon, label: "Missed call" }
        : message.direction === "inbound"
          ? { Icon: PhoneIncomingIcon, label: "Inbound call" }
          : { Icon: PhoneOutgoingIcon, label: "Outbound call" };
  const duration =
    !missed && message.callMeta
      ? formatDuration(message.callMeta.durationSec)
      : null;
  return { ...kind, missed, duration };
}
