"use client";

import { useEffect } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import {
  LEAD_SOURCE_LABELS,
  OPPORTUNITY_STATUS_LABELS,
  type Opportunity,
  type Pipeline,
  type User,
} from "@/types";
import * as api from "@/lib/api";
import { useAction, useResource } from "@/lib/api";
import {
  buildOpportunityFormSchema,
  centsToInput,
  dateInputToIso,
  isoToDateInput,
  parseCents,
  type OpportunityFormValues,
} from "@/lib/validation/opportunity";
import {
  fromCustomFieldsValue,
  toCustomFieldsPatch,
} from "@/lib/validation/custom-fields";
import { CustomFieldsSection } from "@/components/common/custom-fields-section";
import { TagPicker } from "@/components/modules/contacts/tag-picker";
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
import { fullName } from "@/lib/format";
import { ContactPicker } from "./contact-picker";

function emptyValues(
  pipelines: Pipeline[],
  defaultPipelineId: string,
  customFields: Record<string, string | boolean | string[]>,
): OpportunityFormValues {
  const pipeline =
    pipelines.find((p) => p.id === defaultPipelineId) ?? pipelines[0];
  return {
    name: "",
    contactId: "",
    pipelineId: pipeline?.id ?? "",
    stageId: pipeline?.stages[0]?.id ?? "",
    value: "",
    status: "open",
    source: "manual",
    ownerId: "",
    tagIds: [],
    expectedCloseAt: "",
    lostReason: "",
    customFields,
  };
}

function valuesFromOpportunity(
  opportunity: Opportunity,
  customFields: Record<string, string | boolean | string[]>,
): OpportunityFormValues {
  return {
    name: opportunity.name,
    contactId: opportunity.contactId,
    pipelineId: opportunity.pipelineId,
    stageId: opportunity.stageId,
    value: centsToInput(opportunity.value),
    status: opportunity.status,
    source: opportunity.source,
    ownerId: opportunity.ownerId ?? "",
    tagIds: opportunity.tagIds,
    expectedCloseAt: isoToDateInput(opportunity.expectedCloseAt),
    lostReason: opportunity.lostReason ?? "",
    customFields,
  };
}

export function OpportunityFormSheet({
  open,
  onOpenChange,
  opportunity,
  pipelines,
  defaultPipelineId,
  users,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: Opportunity | null;
  pipelines: Pipeline[];
  defaultPipelineId: string;
  users: User[];
}) {
  const customFields = useResource("customFields", () =>
    api.customFields.list("opportunity"),
  );
  const fields = customFields.data ?? [];

  const form = useForm<OpportunityFormValues>({
    resolver: zodResolver(
      buildOpportunityFormSchema(fields),
    ) as Resolver<OpportunityFormValues>,
    defaultValues: emptyValues(pipelines, defaultPipelineId, {}),
  });

  useEffect(() => {
    // The schema is rebuilt from `fields` every render (it's data-driven, not
    // static), so defaultValues must be reseeded here alongside it.
    if (!open) return;
    const customFieldsDefault = fromCustomFieldsValue(
      opportunity?.customFields,
      fields,
    );
    form.reset(
      opportunity
        ? valuesFromOpportunity(opportunity, customFieldsDefault)
        : emptyValues(pipelines, defaultPipelineId, customFieldsDefault),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, opportunity, customFields.data, defaultPipelineId]);

  const selectedPipelineId = form.watch("pipelineId");
  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId);
  const stages = selectedPipeline?.stages ?? [];
  const status = form.watch("status");

  const [save, isSaving] = useAction(async (values: OpportunityFormValues) => {
    const patch = {
      name: values.name.trim(),
      contactId: values.contactId,
      pipelineId: values.pipelineId,
      stageId: values.stageId,
      value: parseCents(values.value),
      currency: selectedPipeline?.currency ?? "USD",
      source: values.source,
      ownerId: values.ownerId || undefined,
      tagIds: values.tagIds,
      expectedCloseAt: dateInputToIso(values.expectedCloseAt),
      customFields: toCustomFieldsPatch(values.customFields, fields),
    };

    /**
     * `status` is not in that patch: `setStatus()` owns it, with `closedAt`
     * and the won/lost activity, so a status change goes through it below.
     * `update()` reads `stageId` only when the pipeline changes: it then moves
     * the deal to that stage of the new pipeline in the same write, with the
     * status that stage gives (as `move()` does). A stage
     * change inside the same pipeline goes through `move()`, which owns column
     * `position` and `stageEnteredAt` there.
     */
    const record = opportunity
      ? await api.opportunities.update(opportunity.id, patch)
      : await api.opportunities.create(patch);

    const pipelineChanged =
      opportunity && opportunity.pipelineId !== values.pipelineId;
    const stageChanged =
      opportunity && !pipelineChanged && opportunity.stageId !== values.stageId;
    if (stageChanged) {
      const column = await api.opportunities.listForBoard(values.pipelineId);
      const appendAt = column.filter(
        (d) => d.stageId === values.stageId,
      ).length;
      await api.opportunities.move(record.id, {
        stageId: values.stageId,
        position: appendAt,
      });
    }

    // Both `move()` and `update()`'s pipeline move derive the status from the
    // destination stage: `record.status` is what the pipeline move left, and
    // `stageStatus()` predicts what `move()` leaves. An explicit choice is
    // applied after either and wins.
    const statusAfterMove = stageChanged
      ? api.opportunities.stageStatus(
          selectedPipeline?.stages.find((s) => s.id === values.stageId),
        )
      : (record.status ?? "open");
    const lostReason =
      values.status === "lost"
        ? values.lostReason.trim() || undefined
        : undefined;
    // A move into a lost stage already leaves the deal lost, so the status
    // alone would skip `setStatus()` and drop the reason the user typed.
    const moveDropsReason =
      (pipelineChanged || stageChanged) &&
      statusAfterMove === "lost" &&
      lostReason !== undefined &&
      lostReason !== record.lostReason;
    if (values.status !== statusAfterMove || moveDropsReason) {
      await api.opportunities.setStatus(record.id, values.status, lostReason);
    }

    toast.success(opportunity ? "Deal updated" : "Deal created");
    onOpenChange(false);
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{opportunity ? "Edit deal" : "New deal"}</SheetTitle>
        </SheetHeader>

        <form
          id="opportunity-form"
          className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4"
          onSubmit={form.handleSubmit((values) => void save(values))}
        >
          <FieldGroup>
            <Field data-invalid={Boolean(form.formState.errors.name)}>
              <FieldLabel htmlFor="name">Deal name</FieldLabel>
              <Input id="name" {...form.register("name")} />
              <FieldError
                errors={
                  form.formState.errors.name
                    ? [form.formState.errors.name]
                    : undefined
                }
              />
            </Field>

            <Field data-invalid={Boolean(form.formState.errors.contactId)}>
              <FieldLabel htmlFor="contactId">Contact</FieldLabel>
              <Controller
                control={form.control}
                name="contactId"
                render={({ field }) => (
                  <ContactPicker
                    id="contactId"
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <FieldError
                errors={
                  form.formState.errors.contactId
                    ? [form.formState.errors.contactId]
                    : undefined
                }
              />
            </Field>

            <Field data-invalid={Boolean(form.formState.errors.value)}>
              <FieldLabel htmlFor="value">Value</FieldLabel>
              <Input
                id="value"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                {...form.register("value")}
              />
              <FieldError
                errors={
                  form.formState.errors.value
                    ? [form.formState.errors.value]
                    : undefined
                }
              />
            </Field>
          </FieldGroup>

          <FieldSeparator />

          <FieldSet>
            <FieldLegend variant="label">Pipeline</FieldLegend>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="pipelineId">Pipeline</FieldLabel>
                <Controller
                  control={form.control}
                  name="pipelineId"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        // Stages belong to a pipeline, so the current stage is
                        // meaningless once the pipeline changes.
                        const next = pipelines.find((p) => p.id === value);
                        form.setValue("stageId", next?.stages[0]?.id ?? "");
                      }}
                    >
                      <SelectTrigger id="pipelineId" className="w-full">
                        <SelectValue>
                          {(value: string) =>
                            pipelines.find((p) => p.id === value)?.name ??
                            "Select a pipeline"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {pipelines.map((pipeline) => (
                          <SelectItem key={pipeline.id} value={pipeline.id}>
                            {pipeline.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              <Field data-invalid={Boolean(form.formState.errors.stageId)}>
                <FieldLabel htmlFor="stageId">Stage</FieldLabel>
                <Controller
                  control={form.control}
                  name="stageId"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        // Status follows the stage the way `move()` derives it;
                        // otherwise "Open" rides along into Closed Won and the
                        // save reopens the deal `move()` just won.
                        const won = stages.find((s) => s.id === value)?.isWon;
                        if (won) form.setValue("status", "won");
                        else if (form.getValues("status") === "won") {
                          form.setValue("status", "open");
                        }
                      }}
                    >
                      <SelectTrigger id="stageId" className="w-full">
                        <SelectValue>
                          {(value: string) =>
                            stages.find((s) => s.id === value)?.name ??
                            "Select a stage"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map((stage) => (
                          <SelectItem key={stage.id} value={stage.id}>
                            {stage.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError
                  errors={
                    form.formState.errors.stageId
                      ? [form.formState.errors.stageId]
                      : undefined
                  }
                />
              </Field>

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
                            OPPORTUNITY_STATUS_LABELS[
                              value as keyof typeof OPPORTUNITY_STATUS_LABELS
                            ]
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(OPPORTUNITY_STATUS_LABELS).map(
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

              {status === "lost" ? (
                <Field>
                  <FieldLabel htmlFor="lostReason">Lost reason</FieldLabel>
                  <Input id="lostReason" {...form.register("lostReason")} />
                </Field>
              ) : null}

              <Field
                data-invalid={Boolean(form.formState.errors.expectedCloseAt)}
              >
                <FieldLabel htmlFor="expectedCloseAt">
                  Expected close
                </FieldLabel>
                {/* No `min`/`max`: native constraint validation would block
                    the submit with a browser bubble before the schema's
                    message could show. */}
                <Input
                  id="expectedCloseAt"
                  type="date"
                  aria-invalid={
                    Boolean(form.formState.errors.expectedCloseAt) || undefined
                  }
                  {...form.register("expectedCloseAt")}
                />
                <FieldError
                  errors={
                    form.formState.errors.expectedCloseAt
                      ? [form.formState.errors.expectedCloseAt]
                      : undefined
                  }
                />
              </Field>
            </FieldGroup>
          </FieldSet>

          <FieldSeparator />

          <FieldSet>
            <FieldLegend variant="label">Ownership</FieldLegend>
            <FieldGroup>
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
                            const user = users.find((u) => u.id === value);
                            return user ? fullName(user) : "Unassigned";
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {users.map((user) => (
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
                    <TagPicker
                      id="tagIds"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </Field>
            </FieldGroup>
          </FieldSet>

          {fields.length > 0 ? (
            <>
              <FieldSeparator />
              <FieldSet>
                <FieldLegend variant="label">Deal details</FieldLegend>
                <CustomFieldsSection fields={fields} control={form.control} />
              </FieldSet>
            </>
          ) : null}
        </form>

        <SheetFooter className="border-t">
          <Button type="submit" form="opportunity-form" disabled={isSaving}>
            {isSaving
              ? "Saving…"
              : opportunity
                ? "Save changes"
                : "Create deal"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
