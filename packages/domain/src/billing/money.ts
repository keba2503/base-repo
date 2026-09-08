import { invariantViolation, type DomainError } from "../kernel/domain-error";
import { err, ok, type Result } from "../kernel/result";

export const currencyMinorUnitExponents = {
  EUR: 2,
  USD: 2,
  GBP: 2,
  JPY: 0,
} as const;

export type Currency = keyof typeof currencyMinorUnitExponents;

export function isCurrency(value: string): value is Currency {
  return Object.prototype.hasOwnProperty.call(currencyMinorUnitExponents, value);
}

export const moneyAmountMinorMaximum = 99_999_999;

function validateAmountMinor(amountMinor: number): DomainError | undefined {
  if (!Number.isSafeInteger(amountMinor)) {
    return invariantViolation(
      "money.amountMinor.notInteger",
      "An amount must be an integer number of minor currency units",
    );
  }
  if (amountMinor <= 0) {
    return invariantViolation("money.amountMinor.notPositive", "An amount must be greater than zero");
  }
  if (amountMinor > moneyAmountMinorMaximum) {
    return invariantViolation(
      "money.amountMinor.tooLarge",
      `An amount must not exceed ${String(moneyAmountMinorMaximum)} minor units`,
    );
  }
  return undefined;
}

function validateCurrency(currency: string): DomainError | undefined {
  if (!isCurrency(currency)) {
    return invariantViolation(
      "money.currency.unsupported",
      `A currency must be one of ${Object.keys(currencyMinorUnitExponents).join(", ")}`,
    );
  }
  return undefined;
}

export class Money {
  readonly amountMinor: number;
  readonly currency: Currency;

  private constructor(amountMinor: number, currency: Currency) {
    this.amountMinor = amountMinor;
    this.currency = currency;
  }

  static create(amountMinor: number, currency: string): Result<Money, DomainError> {
    const invalid = validateAmountMinor(amountMinor) ?? validateCurrency(currency);
    if (invalid) return err(invalid);
    return ok(new Money(amountMinor, currency as Currency));
  }

  equals(other: Money): boolean {
    return this.amountMinor === other.amountMinor && this.currency === other.currency;
  }
}
