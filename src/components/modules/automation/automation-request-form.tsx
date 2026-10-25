"use client";

import { useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import * as api from "@/lib/api";
import { ApiError, useAction } from "@/lib/api";
import {
  EMPTY_AUTOMATION_REQUEST,
  automationRequestSchema,
  type AutomationRequestFormValues,
} from "@/lib/validation/automation-request";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import { PRIORITIES, PRIORITY_LABELS } from "./automation-request-copy";

const SERVER_ERROR = "root.server" as const;

/** The free-text fields, in form order. */
const TEXT_FIELDS = [
  {
    name: "problem",
    label: "What goes wrong today?",
    placeholder: "Deals sit in one stage for weeks and nobody notices.",
  },
  {
    name: "trigger",
    label: "What should start it?",
    placeholder: "A deal has been in the same stage for 14 days.",
  },
  {
    name: "outcome",
    label: "What should happen?",
    placeholder: "Tell the deal's owner and add a follow-up task.",
  },
] as const;

/**
 * The "New request" form: what staff want the developer to build. Sends
 * through `api.automationRequests.create`, which files it as "Requested"
 * under the current user; the list beside it refreshes from the invalidate.
 * A refused send keeps everything typed and shows the API's sentence under
 * the fields. React Hook Form + zod through the `Field*` components.
 */
export function AutomationRequestForm() {
  const ids = {
    heading: useId(),
    title: useId(),
    priority: useId(),
    problem: useId(),
    trigger: useId(),
    outcome: useId(),
  };
  const form = useForm<AutomationRequestFormValues>({
    resolver: zodResolver(automationRequestSchema),
    defaultValues: EMPTY_AUTOMATION_REQUEST,
  });
  const { errors } = form.formState;
  const [send, sending] = useAction(api.automationRequests.create);

  async function submit(values: AutomationRequestFormValues) {
    // Enter submits too, whatever the button's state: one send at a time.
    if (sending) return;
    form.clearErrors(SERVER_ERROR);
    try {
      await send(values);
      toast.success("Request sent", {
        description: "Your developer will reply here.",
      });
      form.reset(EMPTY_AUTOMATION_REQUEST);
    } catch (error) {
      form.setError(SERVER_ERROR, {
        message:
          error instanceof ApiError
            ? error.message
            : "Could not send the request.",
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 id={ids.heading}>New request</h2>
        </CardTitle>
        <CardDescription>
          Describe the follow-up you want to run on its own. Your developer
          builds it and replies here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          aria-labelledby={ids.heading}
          noValidate
          onSubmit={form.handleSubmit((values) => submit(values))}
        >
          <FieldGroup>
            <Field data-invalid={Boolean(errors.title) || undefined}>
              <FieldLabel htmlFor={ids.title}>Title</FieldLabel>
              <Input
                id={ids.title}
                autoComplete="off"
                aria-invalid={Boolean(errors.title) || undefined}
                {...form.register("title")}
              />
              <FieldError errors={[errors.title]} />
            </Field>

            {TEXT_FIELDS.map(({ name, label, placeholder }) => (
              <Field
                key={name}
                data-invalid={Boolean(errors[name]) || undefined}
              >
                <FieldLabel htmlFor={ids[name]}>{label}</FieldLabel>
                <Textarea
                  id={ids[name]}
                  rows={2}
                  placeholder={placeholder}
                  aria-invalid={Boolean(errors[name]) || undefined}
                  {...form.register(name)}
                />
                <FieldError errors={[errors[name]]} />
              </Field>
            ))}

            <Field>
              <FieldLabel htmlFor={ids.priority}>Priority</FieldLabel>
              <Controller
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      if (value) field.onChange(value);
                    }}
                  >
                    <SelectTrigger id={ids.priority} className="w-full">
                      <SelectValue>
                        {(value: string) =>
                          PRIORITY_LABELS[
                            value as AutomationRequestFormValues["priority"]
                          ]
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {PRIORITY_LABELS[priority]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldDescription>
                How much it would help, not a deadline.
              </FieldDescription>
            </Field>

            <FieldError errors={[errors.root?.server]} />

            <Button type="submit" disabled={sending} className="self-start">
              {sending ? (
                <Spinner aria-hidden data-icon="inline-start" />
              ) : null}
              {sending ? "Sending…" : "Send request"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
