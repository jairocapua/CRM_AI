import { InboxShell } from "@/components/modules/conversations/inbox-shell";

/**
 * The shell lives here rather than in each page, so moving between threads
 * swaps only the middle pane: the inbox list keeps its filters and scroll.
 */
export default function ConversationsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <InboxShell>{children}</InboxShell>;
}
