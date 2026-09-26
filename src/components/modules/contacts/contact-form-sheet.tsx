"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";

import * as api from "@/lib/api";
import { useAction, useResource } from "@/lib/api";
import {
  CONTACT_STATUS_LABELS,
  LEAD_SOURCE_LABELS,
  type Contact,
} from "@/types";
import {
  buildContactFormSchema,
  type ContactFormValues,
} from "@/lib/validation/contact";
import {
  fromCustomFieldsValue,
  toCustomFieldsPatch,
} from "@/lib/validation/custom-fields";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { fullName } from "@/lib/format";
import { CustomFieldsSection } from "@/components/common/custom-fields-section";
import { TagPicker } from "./tag-picker";

const EMPTY_ADDRESS = {
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
};

function emptyValues(
  customFieldsDefault: Record<string, string | boolean | string[]>,
): ContactFormValues {
  return {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    companyName: "",
    jobTitle: "",
    address: EMPTY_ADDRESS,
    timezone: "",
    status: "lead",
    source: "manual",
    ownerId: "",
    tagIds: [],
    dnd: { all: false, email: false, sms: false, call: false },
    customFields: customFieldsDefault,
  };
}

function valuesFromContact(
  contact: Contact,
  customFieldsDefault: Record<string, string | boolean | string[]>,
): ContactFormValues {
  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    companyName: contact.companyName ?? "",
    jobTitle: contact.jobTitle ?? "",
    address: {
      line1: contact.address?.line1 ?? "",
      line2: contact.address?.line2 ?? "",
      city: contact.address?.city ?? "",
      state: contact.address?.state ?? "",
      postalCode: contact.address?.postalCode ?? "",
      country: contact.address?.country ?? "",
    },
    timezone: contact.timezone ?? "",
    status: contact.status,
    source: contact.source,
    ownerId: contact.ownerId ?? "",
    tagIds: contact.tagIds,
    dnd: contact.dnd,
    customFields: customFieldsDefault,
  };
}

/** Create/edit Sheet for a contact. Also renders the dynamic custom-fields section. */
export function ContactFormSheet({
  open,
  onOpenChange,
  contact,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact;
}) {
  const customFields = useResource("customFields", () =>
    api.customFields.list("contact"),
  );
  const users = useResource("users", () => api.users.list());
  const fields = customFields.data ?? [];
  const usersById = new Map((users.data ?? []).map((user) => [user.id, user]));

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(
      buildContactFormSchema(fields),
    ) as Resolver<ContactFormValues>,
    defaultValues: emptyValues({}),
  });

  useEffect(() => {
    // The form's schema is rebuilt from `fields` every render (it's
    // data-driven, not static), so defaultValues must be reseeded here
    // alongside it rather than once on mount.
    if (!open) return;
    const customFieldsDefault = fromCustomFieldsValue(
      contact?.customFields,
      fields,
    );
    form.reset(
      contact
        ? valuesFromContact(contact, customFieldsDefault)
        : emptyValues(customFieldsDefault),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contact, customFields.data]);

  const [save, isSaving] = useAction(async (values: ContactFormValues) => {
    const patch = {
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email || undefined,
      phone: values.phone || undefined,
      companyName: values.companyName || undefined,
      jobTitle: values.jobTitle || undefined,
      address: Object.values(values.address).some(Boolean)
        ? values.address
        : undefined,
      timezone: values.timezone || undefined,
      status: values.status,
      source: values.source,
      ownerId: values.ownerId || undefined,
      tagIds: values.tagIds,
      dnd: values.dnd,
      customFields: toCustomFieldsPatch(values.customFields, fields),
    };

    if (contact) {
      await api.contacts.update(contact.id, patch);
      toast.success(`${values.firstName} ${values.lastName} updated`);
    } else {
      await api.contacts.create(patch);
      toast.success(`${values.firstName} ${values.lastName} added`);
    }
    onOpenChange(false);
  });

  const dndAll = form.watch("dnd.all");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{contact ? "Edit contact" : "Add contact"}</SheetTitle>
        </SheetHeader>

        <form
          id="contact-form"
          className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4"
          onSubmit={form.handleSubmit((values) => void save(values))}
        >
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">Basic info</FieldLegend>
              <Field data-invalid={Boolean(form.formState.errors.firstName)}>
                <FieldLabel htmlFor="firstName">First name</FieldLabel>
                <Input id="firstName" {...form.register("firstName")} />
                <FieldError
                  errors={
                    form.formState.errors.firstName
                      ? [form.formState.errors.firstName]
                      : undefined
                  }
                />
              </Field>
              <Field data-invalid={Boolean(form.formState.errors.lastName)}>
                <FieldLabel htmlFor="lastName">Last name</FieldLabel>
                <Input id="lastName" {...form.register("lastName")} />
                <FieldError
                  errors={
                    form.formState.errors.lastName
                      ? [form.formState.errors.lastName]
                      : undefined
                  }
                />
              </Field>
              <Field data-invalid={Boolean(form.formState.errors.email)}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" type="email" {...form.register("email")} />
                <FieldError
                  errors={
                    form.formState.errors.email
                      ? [form.formState.errors.email]
                      : undefined
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <Input id="phone" type="tel" {...form.register("phone")} />
              </Field>
            </FieldSet>

            <FieldSeparator />

            <FieldSet>
              <FieldLegend variant="label">Details</FieldLegend>
              <Field>
                <FieldLabel htmlFor="companyName">Company</FieldLabel>
                <Input id="companyName" {...form.register("companyName")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="jobTitle">Job title</FieldLabel>
                <Input id="jobTitle" {...form.register("jobTitle")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="address.line1">Address</FieldLabel>
                <Input
                  id="address.line1"
                  placeholder="Street address"
                  {...form.register("address.line1")}
                />
                <Input placeholder="City" {...form.register("address.city")} />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="State"
                    {...form.register("address.state")}
                  />
                  <Input
                    placeholder="Postal code"
                    {...form.register("address.postalCode")}
                  />
                </div>
                <Input
                  placeholder="Country"
                  {...form.register("address.country")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
                <Input
                  id="timezone"
                  placeholder="America/Los_Angeles"
                  {...form.register("timezone")}
                />
              </Field>
            </FieldSet>

            <FieldSeparator />

            <FieldSet>
              <FieldLegend variant="label">Status &amp; ownership</FieldLegend>
              <Field>
                <FieldLabel htmlFor="status">Status</FieldLabel>
                <Controller
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="status" className="w-full">
                        <SelectValue>
                          {(value: string) =>
                            CONTACT_STATUS_LABELS[
                              value as keyof typeof CONTACT_STATUS_LABELS
                            ]
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CONTACT_STATUS_LABELS).map(
                          ([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="source">Source</FieldLabel>
                <Controller
                  control={form.control}
                  name="source"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="source" className="w-full">
                        <SelectValue>
                          {(value: string) =>
                            LEAD_SOURCE_LABELS[
                              value as keyof typeof LEAD_SOURCE_LABELS
                            ]
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(LEAD_SOURCE_LABELS).map(
                          ([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ownerId">Owner</FieldLabel>
                <Controller
                  control={form.control}
                  name="ownerId"
                  render={({ field }) => (
                    <Select
                      value={field.value || "unassigned"}
                      onValueChange={(value) =>
                        field.onChange(value === "unassigned" ? "" : value)
                      }
                    >
                      <SelectTrigger id="ownerId" className="w-full">
                        <SelectValue>
                          {(value: string) => {
                            const user = usersById.get(value);
                            return user ? fullName(user) : "Unassigned";
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {(users.data ?? []).map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {fullName(user)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="tagIds">Tags</FieldLabel>
                <Controller
                  control={form.control}
                  name="tagIds"
                  render={({ field }) => (
                    <TagPicker value={field.value} onChange={field.onChange} />
                  )}
                />
              </Field>
            </FieldSet>

            <FieldSeparator />

            <FieldSet>
              <FieldLegend variant="label">Do not disturb</FieldLegend>
              <Controller
                control={form.control}
                name="dnd.all"
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Switch
                      id="dnd-all"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <FieldLabel htmlFor="dnd-all">All channels</FieldLabel>
                  </Field>
                )}
              />
              <Controller
                control={form.control}
                name="dnd.email"
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Switch
                      id="dnd-email"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={dndAll}
                    />
                    <FieldLabel htmlFor="dnd-email">Email</FieldLabel>
                  </Field>
                )}
              />
              <Controller
                control={form.control}
                name="dnd.sms"
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Switch
                      id="dnd-sms"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={dndAll}
                    />
                    <FieldLabel htmlFor="dnd-sms">SMS</FieldLabel>
                  </Field>
                )}
              />
              <Controller
                control={form.control}
                name="dnd.call"
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Switch
                      id="dnd-call"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={dndAll}
                    />
                    <FieldLabel htmlFor="dnd-call">Calls</FieldLabel>
                  </Field>
                )}
              />
            </FieldSet>

            {fields.length > 0 ? (
              <>
                <FieldSeparator />
                <FieldSet>
                  <FieldLegend variant="label">Custom fields</FieldLegend>
                  <CustomFieldsSection fields={fields} control={form.control} />
                </FieldSet>
              </>
            ) : null}
          </FieldGroup>
        </form>

        <SheetFooter className="border-t">
          <Button type="submit" form="contact-form" disabled={isSaving}>
            {isSaving ? "Saving…" : contact ? "Save changes" : "Add contact"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
