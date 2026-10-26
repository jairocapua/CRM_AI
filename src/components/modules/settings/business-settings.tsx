"use client";

import { useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import type { CurrencyCode, Location } from "@/types";
import * as api from "@/lib/api";
import {
  ApiError,
  invalidate,
  loadErrorOf,
  useAction,
  useResource,
} from "@/lib/api";
import {
  businessSchema,
  toBusinessForm,
  toBusinessPatch,
  type BusinessFormValues,
} from "@/lib/validation/business";
import { LoadError } from "@/components/common/load-error";
import { useUnsavedChanges } from "@/components/providers/unsaved-changes";
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

/** "USD · US Dollar": the code, then its English name when known. */
function currencyLabel(code: CurrencyCode): string {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "currency" }).of(code);
    return name && name !== code ? `${code} · ${name}` : code;
  } catch {
    return code;
  }
}

/**
 * The business page body: the active location
 * (`api.settings.activeLocation()`) in a form.
 *
 * The skeleton shows only on the first load. When that read fails there is
 * nothing to edit, so the page shows a `LoadError` whose Retry invalidates
 * "settings": the sidebar's location switcher reads the same location and
 * recovers with it.
 */
export function BusinessSettings() {
  const location = useResource(
    "settings",
    () => api.settings.activeLocation(),
    "active-location",
  );

  if (location.isLoading && location.data === undefined) {
    return <SettingsFormSkeleton fields={7} />;
  }
  const loadError = loadErrorOf(location);
  if (loadError) {
    return (
      <LoadError
        title="Could not load the business details"
        message={loadError.message}
        onRetry={() => invalidate("settings")}
        retrying={location.isRefreshing}
      />
    );
  }
  if (!location.data) return null;
  return <BusinessForm key={location.data.id} location={location.data} />;
}

/**
 * Edits the business keys and saves them through
 * `api.settings.updateLocation`, sending only those keys
 * (`toBusinessPatch`). The currency is read-only: changing it would change
 * what every stored amount means. A refused save keeps everything typed and
 * shows the API's sentence above Save; a saved one toasts and resets the
 * form to what was stored. While it has unsaved edits, leaving the page asks
 * first.
 */
function BusinessForm({ location }: { location: Location }) {
  const headingId = useId();
  const form = useForm<BusinessFormValues>({
    resolver: zodResolver(businessSchema),
    defaultValues: toBusinessForm(location),
  });
  const { errors, isDirty } = form.formState;
  useUnsavedChanges(isDirty ? "the business details" : null);
  const [save, saving] = useAction(api.settings.updateLocation);

  async function submit(values: BusinessFormValues) {
    // Enter submits too, whatever the button's state: one save at a time.
    if (saving) return;
    form.clearErrors(SERVER_ERROR);
    try {
      const saved = await save(location.id, toBusinessPatch(values));
      toast.success("Business details saved");
      form.reset(toBusinessForm(saved));
    } catch (error) {
      form.setError(SERVER_ERROR, {
        message:
          error instanceof ApiError
            ? error.message
            : "Could not save the business details.",
      });
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>
          <h2 id={headingId}>Business details</h2>
        </CardTitle>
        <CardDescription>
          The name your team and your contacts know the business by.
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
              name="name"
              label="Business name"
              autoComplete="organization"
            />
            <TextField
              form={form}
              name="industry"
              label="Industry"
              optional
              autoComplete="off"
            />
            <TextField
              form={form}
              name="email"
              label="Email"
              optional
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
              name="website"
              label="Website"
              optional
              type="url"
              autoComplete="url"
              placeholder="https://"
            />
            <TimeZoneField
              form={form}
              name="timezone"
              label="Time zone"
              description="The time zone the business works in."
            />
            <ReadOnlyField
              label="Currency"
              value={currencyLabel(location.currency)}
              description="Fixed: changing it would change what every amount already recorded means."
            />
          </div>
          <SaveFooter serverError={errors.root?.server} saving={saving} />
        </form>
      </CardContent>
    </Card>
  );
}
