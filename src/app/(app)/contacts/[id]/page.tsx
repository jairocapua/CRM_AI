import { ContactDetail } from "@/components/modules/contacts/detail/contact-detail";

export const metadata = { title: "Contact" };

export default async function ContactDetailPage({
  params,
}: PageProps<"/contacts/[id]">) {
  const { id } = await params;
  return <ContactDetail id={id} />;
}
