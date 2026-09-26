"use client";

import * as api from "@/lib/api";
import { useResource } from "@/lib/api";
import { LEAD_SOURCE_LABELS, type Contact } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPhone, fullName } from "@/lib/format";
import { TagBadge } from "../tag-badge";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export function ContactInfoPanel({ contact }: { contact: Contact }) {
  const tags = useResource("tags", () => api.tags.list());
  const users = useResource("users", () => api.users.list());
  const customFields = useResource("customFields", () =>
    api.customFields.list("contact"),
  );

  const contactTags = (tags.data ?? []).filter((t) =>
    contact.tagIds.includes(t.id),
  );
  const owner = contact.ownerId
    ? (users.data ?? []).find((u) => u.id === contact.ownerId)
    : undefined;
  const address = contact.address;
  const addressLine = address
    ? [
        address.line1,
        address.line2,
        address.city,
        address.state,
        address.postalCode,
        address.country,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  const dndParts = contact.dnd.all
    ? ["All channels"]
    : [
        contact.dnd.email && "Email",
        contact.dnd.sms && "SMS",
        contact.dnd.call && "Calls",
      ].filter((v): v is string => Boolean(v));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Row label="Email" value={contact.email || "—"} />
          <Row
            label="Phone"
            value={contact.phone ? formatPhone(contact.phone) : "—"}
          />
          <Row label="Owner" value={owner ? fullName(owner) : "Unassigned"} />
          <Row label="Source" value={LEAD_SOURCE_LABELS[contact.source]} />
          {addressLine ? <Row label="Address" value={addressLine} /> : null}
          <Row label="Timezone" value={contact.timezone || "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tags</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {contactTags.length > 0 ? (
            contactTags.map((tag) => <TagBadge key={tag.id} tag={tag} />)
          ) : (
            <span className="text-sm text-muted-foreground">No tags</span>
          )}
        </CardContent>
      </Card>

      {dndParts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Do not disturb</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {dndParts.join(", ")}
          </CardContent>
        </Card>
      ) : null}

      {customFields.data && customFields.data.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Custom fields</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {customFields.data.map((field) => {
              const value = contact.customFields[field.key];
              const display = Array.isArray(value)
                ? value.join(", ") || "—"
                : typeof value === "boolean"
                  ? value
                    ? "Yes"
                    : "No"
                  : value == null || value === ""
                    ? "—"
                    : String(value);
              return <Row key={field.id} label={field.label} value={display} />;
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
