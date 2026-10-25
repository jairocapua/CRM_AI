import {
  ArrowRightLeftIcon,
  BellIcon,
  CircleStopIcon,
  ClockIcon,
  MailIcon,
  MessageSquareTextIcon,
  PencilLineIcon,
  SplitIcon,
  SquareCheckIcon,
  TagIcon,
  UserPlusIcon,
  WebhookIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";

import type { NodeCategory, WorkflowNodeKind } from "@/types";

/**
 * One icon per step kind, for the step list (and the diagram's nodes, P8-T05).
 * Every trigger shares the trigger icon. Exhaustive by type, so a new kind
 * cannot ship without one.
 */
const ICONS: Record<WorkflowNodeKind, LucideIcon> = {
  form_submitted: ZapIcon,
  tag_added: ZapIcon,
  appointment_booked: ZapIcon,
  opportunity_stage_changed: ZapIcon,
  contact_created: ZapIcon,
  inbound_message: ZapIcon,
  birthday: ZapIcon,
  manual: ZapIcon,
  send_sms: MessageSquareTextIcon,
  send_email: MailIcon,
  wait: ClockIcon,
  if_else: SplitIcon,
  add_tag: TagIcon,
  remove_tag: TagIcon,
  assign_user: UserPlusIcon,
  create_task: SquareCheckIcon,
  update_contact_field: PencilLineIcon,
  move_opportunity: ArrowRightLeftIcon,
  webhook: WebhookIcon,
  internal_notification: BellIcon,
  end: CircleStopIcon,
};

/** A step's icon, decorative: the step's label says what it is. */
export function StepIcon({
  kind,
  className,
}: {
  kind: WorkflowNodeKind;
  className?: string;
}) {
  const Icon = ICONS[kind];
  return <Icon aria-hidden className={className} />;
}

/** The icon tile's colours: triggers, actions and logic read apart. */
export const CATEGORY_TILE: Record<NodeCategory, string> = {
  trigger: "bg-primary text-primary-foreground",
  action: "bg-muted text-foreground",
  logic: "bg-secondary text-secondary-foreground ring-1 ring-border",
};
