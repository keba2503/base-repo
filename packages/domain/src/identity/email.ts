import { invariantViolation, type DomainError } from "../kernel/domain-error";
import { err, ok, type Result } from "../kernel/result";

declare const emailBrand: unique symbol;

export type Email = string & { readonly [emailBrand]: "Email" };

export const emailMaximumLength = 254;

const emailPattern =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

export function parseEmail(value: string): Result<Email, DomainError> {
  const normalised = value.trim().toLowerCase();
  if (normalised.length === 0 || normalised.length > emailMaximumLength) {
    return err(
      invariantViolation(
        "email.length",
        `An email must have between 1 and ${String(emailMaximumLength)} characters`,
      ),
    );
  }
  if (!emailPattern.test(normalised) || normalised.includes("..")) {
    return err(invariantViolation("email.format", "An email must have a local part, an @ and a domain"));
  }
  return ok(normalised as Email);
}
