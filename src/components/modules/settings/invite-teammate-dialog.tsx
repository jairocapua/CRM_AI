"use client";

import { useId, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlusIcon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import type { UserRole } from "@/types";
import * as api from "@/lib/api";
import { ApiError, useAction } from "@/lib/api";
import { fullName } from "@/lib/format";
import {
  EMPTY_INVITE,
  inviteSchema,
  toInviteDraft,
  USER_ROLES,
  type InviteFormValues,
} from "@/lib/validation/team";
import { useUnsavedChanges } from "@/components/providers/unsaved-changes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { SERVER_ERROR, TextField } from "./settings-form-parts";
import { ROLE_LABELS, serverErrorField } from "./team-copy";

/** The fields a refusal can be about (`ApiError.field`), marked in place. */
const INVITE_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "role",
  "jobTitle",
] as const satisfies readonly (keyof InviteFormValues)[];

/**
 * "Invite teammate" and its dialog. The new teammate joins the list as
 * Pending until they first sign in; nothing is emailed (the demo sends
 * none, so the copy never says it does).
 */
export function InviteTeammateDialog() {
  const [open, setOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const titleId = useId();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // No closing mid-invite: a failure must land in a mounted form.
        if (!next && inviting) return;
        setOpen(next);
      }}
    >
      <DialogTrigger render={<Button type="button" />}>
        <UserPlusIcon data-icon="inline-start" aria-hidden />
        Invite teammate
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle id={titleId}>Invite a teammate</DialogTitle>
          <DialogDescription>
            Add someone to the team and pick their role. They show as Pending
            until they first sign in.
          </DialogDescription>
        </DialogHeader>
        <InviteForm
          titleId={titleId}
          onPendingChange={setInviting}
          onInvited={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The invite form: React Hook Form + zod (`inviteSchema`, the rules the API
 * checks too) through the `Field*` components. Mounted only while the
 * dialog is open, so it opens empty every time.
 *
 * A refusal about one field (an email a teammate already has) marks that
 * field; any other (a network failure) shows above the buttons. Either way
 * everything typed stays. Success toasts the teammate's name, resets the
 * form and closes the dialog. While something is typed, a reload or a
 * closed tab asks first (`useUnsavedChanges`); the dialog is modal, so no
 * link on the page can be clicked meanwhile. While the invite is on its
 * way the dialog cannot close (`onPendingChange`; Cancel is disabled and
 * Escape or an outside click does nothing), so the result always lands in
 * this form.
 */
function InviteForm({
  titleId,
  onPendingChange,
  onInvited,
}: {
  titleId: string;
  onPendingChange: (pending: boolean) => void;
  onInvited: () => void;
}) {
  const roleId = useId();
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: EMPTY_INVITE,
  });
  const { errors, isDirty } = form.formState;
  useUnsavedChanges(isDirty ? "the invite" : null);
  const [invite, inviting] = useAction(api.users.invite);

  async function submit(values: InviteFormValues) {
    // Enter submits too, whatever the button's state: one invite at a time.
    if (inviting) return;
    form.clearErrors(SERVER_ERROR);
    onPendingChange(true);
    try {
      const user = await invite(toInviteDraft(values));
      onPendingChange(false);
      toast.success(`${fullName(user)} added to the team`, {
        description: "They show as Pending until they first sign in.",
      });
      form.reset(EMPTY_INVITE);
      onInvited();
    } catch (error) {
      onPendingChange(false);
      const message =
        error instanceof ApiError
          ? error.message
          : "Could not invite this teammate.";
      const field = serverErrorField(error, INVITE_FIELDS);
      if (field) form.setError(field, { message }, { shouldFocus: true });
      else form.setError(SERVER_ERROR, { message });
    }
  }

  return (
    <form
      aria-labelledby={titleId}
      noValidate
      onSubmit={form.handleSubmit(submit)}
      className="flex flex-col gap-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          form={form}
          name="firstName"
          label="First name"
          autoComplete="off"
        />
        <TextField
          form={form}
          name="lastName"
          label="Last name"
          autoComplete="off"
        />
        <div className="sm:col-span-2">
          <TextField
            form={form}
            name="email"
            label="Email"
            type="email"
            autoComplete="off"
          />
        </div>
        <Controller
          control={form.control}
          name="role"
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor={roleId}>Role</FieldLabel>
              <Select
                value={field.value}
                onValueChange={(value) => {
                  if (value) field.onChange(value);
                }}
              >
                <SelectTrigger
                  id={roleId}
                  className="w-full"
                  aria-invalid={error ? true : undefined}
                  onBlur={field.onBlur}
                >
                  <SelectValue>
                    {(value: string) => ROLE_LABELS[value as UserRole]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <TextField
          form={form}
          name="jobTitle"
          label="Job title"
          optional
          autoComplete="off"
        />
      </div>
      <FieldError errors={[errors.root?.server]} />
      <DialogFooter>
        <DialogClose
          disabled={inviting}
          render={<Button type="button" variant="outline" />}
        >
          Cancel
        </DialogClose>
        <Button
          type="submit"
          disabled={inviting}
          focusableWhenDisabled
          className="data-disabled:opacity-50"
        >
          {inviting ? <Spinner aria-hidden data-icon="inline-start" /> : null}
          {inviting ? "Inviting…" : "Invite teammate"}
        </Button>
      </DialogFooter>
    </form>
  );
}
