import { z } from "zod";

import { isTimeZone } from "./availability";

/**
 * Field rules the profile and business forms share (`profile.ts`,
 * `business.ts`), and so do the API calls that save them (`users.update`,
 * `settings.updateLocation`): one rule, one message, in the form and the API.
 *
 * Every text field is trimmed. An optional field may be left empty: the
 * empty string is how the form says "none", and the API then removes the
 * stored value.
 */

const EMAIL_EXAMPLE = "Enter a valid email address, like name@example.com.";

/** Whether `value` reads as one email address. */
export function isEmailAddress(value: string): boolean {
  return z.email().safeParse(value).success;
}

/** Whether `value` is an http(s) web address with a dotted host name. */
export function isWebAddress(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    (url.protocol === "https:" || url.protocol === "http:") &&
    url.hostname.includes(".") &&
    !url.hostname.endsWith(".")
  );
}

/** A trimmed text that must not be empty. */
export const requiredText = (message: string) =>
  z.string().trim().min(1, message);

/** A trimmed text that may be empty. */
export const optionalText = () => z.string().trim();

/** A required email address: empty and malformed each have a message. */
export const requiredEmail = () =>
  z
    .string()
    .trim()
    .min(1, { error: "Enter an email address.", abort: true })
    .refine(isEmailAddress, EMAIL_EXAMPLE);

/** An email address that may be left empty. */
export const optionalEmail = () =>
  z
    .string()
    .trim()
    .refine((value) => value === "" || isEmailAddress(value), EMAIL_EXAMPLE);

/** A web address that may be left empty. */
export const optionalWebsite = () =>
  z
    .string()
    .trim()
    .refine(
      (value) => value === "" || isWebAddress(value),
      "Enter a web address that starts with https://.",
    );

/** A time zone this runtime knows (an IANA name such as "Asia/Singapore"). */
export const timeZone = () =>
  z
    .string()
    .min(1, { error: "Choose a time zone.", abort: true })
    .refine(isTimeZone, "Choose a time zone from the list.");
