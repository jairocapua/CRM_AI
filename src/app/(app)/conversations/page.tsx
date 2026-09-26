import { MessagesSquareIcon } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";

export const metadata = { title: "Conversations" };

/** The thread pane before anything is selected. */
export default function ConversationsPage() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        icon={MessagesSquareIcon}
        title="Select a conversation"
        description="SMS, email, WhatsApp, Messenger, Instagram and live chat — one inbox."
      />
    </div>
  );
}
