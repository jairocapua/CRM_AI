import {
  MailIcon,
  MessageCircleMoreIcon,
  MessageSquareIcon,
  PhoneIcon,
  VoicemailIcon,
} from "lucide-react";

import type { Channel } from "@/types";
import { InstagramIcon, MessengerIcon } from "@/components/icons/social";
import { WhatsAppIcon } from "@/components/icons/whatsapp";
import { cn } from "@/lib/utils";

export const CHANNEL_LABELS: Record<Channel, string> = {
  sms: "SMS",
  email: "Email",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
  livechat: "Live chat",
  call: "Call",
  voicemail: "Voicemail",
};

const ICONS: Record<Channel, React.ComponentType<{ className?: string }>> = {
  sms: MessageSquareIcon,
  email: MailIcon,
  whatsapp: WhatsAppIcon,
  messenger: MessengerIcon,
  instagram: InstagramIcon,
  livechat: MessageCircleMoreIcon,
  call: PhoneIcon,
  voicemail: VoicemailIcon,
};

/**
 * One icon per channel, monochrome so a dense inbox stays calm. Pass `label`
 * when the icon stands alone and has to be announced.
 */
export function ChannelIcon({
  channel,
  className,
  label = false,
}: {
  channel: Channel;
  className?: string;
  label?: boolean;
}) {
  const Icon = ICONS[channel];
  return (
    <>
      <Icon className={cn("size-3.5 shrink-0", className)} />
      {label ? (
        <span className="sr-only">{CHANNEL_LABELS[channel]}</span>
      ) : null}
    </>
  );
}
