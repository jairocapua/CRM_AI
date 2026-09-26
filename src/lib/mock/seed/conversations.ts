import type {
  Channel,
  Contact,
  Conversation,
  Message,
  MessageStatus,
  User,
} from "@/types";
import { newId } from "../ids";
import { chance, int, pick, refPlusMinutes } from "./rng";

const CHANNEL_POOL: Channel[] = [
  "sms",
  "sms",
  "sms",
  "email",
  "email",
  "whatsapp",
  "messenger",
  "instagram",
  "livechat",
  "call",
];

const INBOUND_OPENERS = [
  "Hi! I filled out the form on your site about the free audit.",
  "Hey, is anyone available to talk about ads this week?",
  "Saw your case study on LinkedIn - do you work with dental practices?",
  "Following up on the proposal you sent. Quick question about the retainer.",
  "Can you send over pricing for the full funnel build?",
  "We are looking to switch agencies. Are you taking new clients?",
  "Just downloaded the playbook, thanks! Any chance of a quick call?",
  "Hi, do you handle Google Ads as well or just Meta?",
];

const INBOUND_REPLIES = [
  "That works for me.",
  "Sounds good - what time zone are you in?",
  "Let me check with my partner and get back to you.",
  "Perfect, I just booked a slot.",
  "Can we push that to next week?",
  "Yes please, send it over.",
  "Got it, thanks!",
  "One more thing - is there a setup fee?",
  "We are comparing a couple of options, but you are top of the list.",
  "Appreciate the quick reply.",
];

const OUTBOUND_REPLIES = [
  "Thanks for reaching out! Happy to help - what does your current setup look like?",
  "Absolutely, we work with practices like yours all the time.",
  "Here is my calendar, grab whichever slot suits: northwind.studio/book",
  "Just sent that over - let me know if it lands in spam.",
  "No setup fee, the retainer covers onboarding.",
  "Of course, I will follow up early next week.",
  "Great question. We handle both Meta and Google, usually starting with whichever has the warmer audience.",
  "Confirmed for Thursday at 10am. Talk soon!",
  "No rush at all - happy to answer anything in the meantime.",
];

const EMAIL_SUBJECTS = [
  "Website audit results",
  "Proposal for Q4",
  "Quick question about your ads",
  "Following up",
  "Kickoff next steps",
  "Reporting for last month",
];

const CALL_NOTES = [
  "Discovery call - discussed goals and current spend.",
  "Left a voicemail about the proposal.",
  "Quick check-in call.",
  "Walked through the reporting dashboard.",
];

/**
 * Terminal delivery states only. Live "sending" states are produced by the
 * composer at runtime; persisting them would leave stuck spinners after a
 * refresh.
 */
const OUTBOUND_STATUSES: MessageStatus[] = [
  "delivered",
  "delivered",
  "delivered",
  "read",
  "read",
  "sent",
  "failed",
];

export interface ConversationSeed {
  conversations: Conversation[];
  messages: Message[];
}

export function seedConversations(
  contacts: Contact[],
  users: User[],
  count: number,
): ConversationSeed {
  const conversations: Conversation[] = [];
  const messages: Message[] = [];

  // Conversations belong to the most engaged contacts, not a random slice.
  const pool = [...contacts]
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(count * 2, 60));

  for (let i = 0; i < count; i++) {
    const contact = pool[i % pool.length]!;
    const primary = pick(CHANNEL_POOL);
    const conversationId = newId("conv");

    const messageCount = int(3, 18);
    const startedDaysAgo = int(1, 60);
    const threadMessages: Message[] = [];
    const channelsSeen = new Set<Channel>([primary]);

    for (let m = 0; m < messageCount; m++) {
      const inbound = m === 0 ? true : chance(0.5);
      // Messages march forward in time from the thread start to now.
      const progress = m / Math.max(1, messageCount - 1);
      const daysAgo = startedDaysAgo - startedDaysAgo * progress;
      // Counted back from REF_DATE in minutes, so nothing lands after the
      // demo clock's "now" (a thread in the future sorts above anything sent
      // today). The two draws are the ones this line has always made — keep
      // them, or every seeder after this one shifts.
      const jitterMinutes = (int(8, 19) - 8) * 60 + int(0, 59);
      const sentAt = refPlusMinutes(
        -(Math.round(daysAgo * 1440) + jitterMinutes + 5),
      );

      // Occasionally a thread hops channel, which is the whole point of a
      // unified inbox.
      const channel = chance(0.12) ? pick(CHANNEL_POOL) : primary;
      channelsSeen.add(channel);

      const isCall = channel === "call" || channel === "voicemail";
      const body = isCall
        ? pick(CALL_NOTES)
        : m === 0
          ? pick(INBOUND_OPENERS)
          : inbound
            ? pick(INBOUND_REPLIES)
            : pick(OUTBOUND_REPLIES);

      // Calls still consume the status draw (stream stability) but have no
      // delivery state — a "carrier rejected" phone call is meaningless.
      const drawnStatus = inbound ? "delivered" : pick(OUTBOUND_STATUSES);
      const status: MessageStatus = isCall ? "delivered" : drawnStatus;

      const message: Message = {
        id: newId("msg"),
        conversationId,
        channel,
        direction: inbound ? "inbound" : "outbound",
        status,
        body,
        subject:
          channel === "email"
            ? m === 0
              ? pick(EMAIL_SUBJECTS)
              : undefined
            : undefined,
        attachments: [],
        authorId: inbound ? undefined : pick(users).id,
        sentAt,
        readAt: inbound && chance(0.7) ? sentAt : undefined,
        failureReason:
          status === "failed" ? "Carrier rejected the message" : undefined,
        callMeta: isCall
          ? { durationSec: int(0, 1400), missed: chance(0.3) }
          : undefined,
        createdAt: sentAt,
        updatedAt: sentAt,
      };

      threadMessages.push(message);
    }

    threadMessages.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    const last = threadMessages[threadMessages.length - 1]!;

    // Unread only counts trailing inbound messages — the realistic case.
    let unread = 0;
    for (let m = threadMessages.length - 1; m >= 0; m--) {
      const msg = threadMessages[m]!;
      if (msg.direction !== "inbound" || msg.readAt) break;
      unread += 1;
    }

    conversations.push({
      id: conversationId,
      contactId: contact.id,
      channels: [...channelsSeen],
      lastChannel: last.channel,
      subject: threadMessages.find((m) => m.subject)?.subject,
      preview: last.body,
      lastMessageAt: last.sentAt,
      unreadCount: unread,
      isStarred: chance(0.15),
      isArchived: chance(0.08),
      status: chance(0.75) ? "open" : "closed",
      assigneeId: contact.ownerId ?? pick(users).id,
      messageIds: threadMessages.map((m) => m.id),
      createdAt: threadMessages[0]!.sentAt,
      updatedAt: last.sentAt,
    });

    messages.push(...threadMessages);
  }

  return { conversations, messages };
}
