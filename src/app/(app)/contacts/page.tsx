import { ContactsTable } from "@/components/modules/contacts/contacts-table";
import { PageHeader } from "@/components/common/page-header";

export const metadata = { title: "Contacts" };

export default function ContactsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Contacts"
        description="Everyone you talk to, with tags and custom fields."
      />
      <ContactsTable />
    </div>
  );
}
