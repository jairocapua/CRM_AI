import { ThreadView } from "@/components/modules/conversations/thread-view";

export const metadata = { title: "Conversation" };

export default async function ConversationPage({
  params,
}: PageProps<"/conversations/[id]">) {
  const { id } = await params;
  // Keyed so a different thread starts with fresh local state (optimistic
  // sends, the composer draft, the scroller's position).
  return <ThreadView key={id} id={id} />;
}
