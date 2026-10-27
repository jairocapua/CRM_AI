"use client";

import * as api from "@/lib/api";
import { useResource } from "@/lib/api";

/**
 * A conversation and then its contact: the chain the thread pane and the
 * contact panel both read. The contact read waits until the conversation
 * names it (`"none"` until then); each caller still runs its own reads.
 */
export function useConversationContact(conversationId: string) {
  const conversation = useResource(
    "conversations",
    () => api.conversations.get(conversationId),
    conversationId,
  );
  const contactId = conversation.data?.contactId;
  const contact = useResource(
    "contacts",
    () =>
      contactId ? api.contacts.get(contactId) : Promise.resolve(undefined),
    contactId ?? "none",
  );
  return { conversation, contact };
}
