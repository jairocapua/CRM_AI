import type { Audited, Channel, ID, ISODate } from "./common";

export type MessageDirection = "inbound" | "outbound";

export type MessageStatus =
  "queued" | "sending" | "sent" | "delivered" | "read" | "failed";

export interface Attachment {
  id: ID;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

export interface Message extends Audited {
  id: ID;
  conversationId: ID;
  channel: Channel;
  direction: MessageDirection;
  status: MessageStatus;
  body: string;
  /** Email only. */
  subject?: string;
  attachments: Attachment[];
  /** Set when outbound and sent by a human. */
  authorId?: ID;
  sentByAutomation?: { workflowId: ID; nodeId: ID };
  sentAt: ISODate;
  readAt?: ISODate;
  failureReason?: string;
  callMeta?: { durationSec: number; missed: boolean };
}

export interface Conversation extends Audited {
  id: ID;
  contactId: ID;
  /** Every channel seen in this thread. */
  channels: Channel[];
  lastChannel: Channel;
  subject?: string;
  /** Denormalised body of the newest message, for the list pane. */
  preview: string;
  lastMessageAt: ISODate;
  unreadCount: number;
  isStarred: boolean;
  isArchived: boolean;
  status: "open" | "closed";
  assigneeId?: ID;
  /** Ordered oldest → newest. */
  messageIds: ID[];
}

export type InboxTab = "unread" | "recents" | "starred" | "all";
