"use client";

import { useId } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import type { User, UserRole } from "@/types";
import * as api from "@/lib/api";
import {
  ApiError,
  invalidate,
  loadErrorOf,
  useAction,
  useResource,
} from "@/lib/api";
import {
  profileSchema,
  toProfileForm,
  toProfilePatch,
  type ProfileFormValues,
} from "@/lib/validation/profile";
import { LoadError } from "@/components/common/load-error";
import {
  useLeaveGuard,
  useUnsavedChanges,
} from "@/components/providers/unsaved-changes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ReadOnlyField,
  SaveFooter,
  SERVER_ERROR,
  SettingsFormSkeleton,
  TextField,
  TimeZoneField,
} from "./settings-form-parts";

/** How each role reads on screen. */
export const ROLE_LABELS: Record<UserRole, string> = {
  agency_owner: "Agency owner",
  admin: "Admin",
  user: "User",
};

/**
 * The profile page body: the current user (`api.users.me()`) in a form.
 *
 * The skeleton shows only on the first load. When that read fails there is
 * nothing to edit, so the page shows a `LoadError` whose Retry invalidates
 * "users": the sidebar's user menu reads the same user and recovers with it.
 */
export function ProfileSettings() {
  const me = useResource("users", () => api.users.me(), "me");

  if (me.isLoading && me.data === undefined) {
    return <SettingsFormSkeleton fields={7} />;
  }
  const loadError = loadErrorOf(me);
  if (loadError) {
    return (
      <LoadError
        title="Could not load your profile"
        message={loadError.message}
        onRetry={() => invalidate("users")}
        retrying={me.isRefreshing}
      />
    );
  }
  if (!me.data) return null;
  return <ProfileForm key={me.data.id} user={me.data} />;
}

/**
 * Edits the profile keys and saves them through `api.users.update`, sending
 * only those keys (`toProfilePatch`), never the role, slug or id. A refused
 * save keeps everything typed and shows the API's sentence above Save; a
 * saved one toasts and resets the form to what was stored, so it is clean
 * again. While it has unsaved edits, leaving the page asks first.
 */
function ProfileForm({ user }: { user: User }) {
  const headingId = useId();
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: toProfileForm(user),
  });
  const { errors, isDirty } = form.formState;
  useUnsavedChanges(isDirty ? "your profile" : null);
  const guardLeave = useLeaveGuard();
  const [save, saving] = useAction(api.users.update);

  async function submit(values: ProfileFormValues) {
    // Enter submits too, whatever the button's state: one save at a time.
    if (saving) return;
    form.clearErrors(SERVER_ERROR);
    try {
      const saved = await save(user.id, toProfilePatch(values));
      toast.success("Profile saved");
      form.reset(toProfileForm(saved));
    } catch (error) {
      form.setError(SERVER_ERROR, {
        message:
          error instanceof ApiError
            ? error.message
            : "Could not save your profile.",
      });
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>
          <h2 id={headingId}>Your details</h2>
        </CardTitle>
        <CardDescription>
          Your teammates see your name on records you own.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          aria-labelledby={headingId}
          noValidate
          onSubmit={form.handleSubmit(submit)}
          className="flex flex-col gap-6"
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <TextField
              form={form}
              name="firstName"
              label="First name"
              autoComplete="given-name"
            />
            <TextField
              form={form}
              name="lastName"
              label="Last name"
              autoComplete="family-name"
            />
            <TextField
              form={form}
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
            />
            <TextField
              form={form}
              name="phone"
              label="Phone"
              optional
              type="tel"
              autoComplete="tel"
            />
            <TextField
              form={form}
              name="jobTitle"
              label="Job title"
              optional
              autoComplete="organization-title"
            />
            <TimeZoneField
              form={form}
              name="timezone"
              label="Time zone"
              description="The time zone you work in."
            />
            <ReadOnlyField
              label="Role"
              value={ROLE_LABELS[user.role]}
              description={
                <>
                  Roles are changed on the{" "}
                  <Link
                    href="/settings/team"
                    onNavigate={guardLeave("/settings/team")}
                  >
                    Team
                  </Link>{" "}
                  page.
                </>
              }
            />
          </div>
          <SaveFooter serverError={errors.root?.server} saving={saving} />
        </form>
      </CardContent>
    </Card>
  );
}
