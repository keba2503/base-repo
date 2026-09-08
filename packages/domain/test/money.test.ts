import { describe, expect, it } from "bun:test";
import { isOk } from "../src/kernel/result";
import { Money } from "../src/billing/money";

function createFailureCode(amountMinor: number, currency: string): string {
  const result = Money.create(amountMinor, currency);
  if (isOk(result)) throw new Error("Expected the amount to be rejected");
  return result.error.code;
}

describe("money creation", () => {
  it("accepts a positive integer amount in a supported currency", () => {
    const result = Money.create(1_999, "EUR");
    if (!isOk(result)) throw new Error("Expected the amount to be accepted");
    expect([result.value.amountMinor, result.value.currency]).toEqual([1_999, "EUR"]);
  });

  it("rejects a non-integer amount", () => {
    expect(createFailureCode(19.99, "EUR")).toBe("money.amountMinor.notInteger");
  });

  it("rejects a negative amount", () => {
    expect(createFailureCode(-100, "EUR")).toBe("money.amountMinor.negative");
  });

  it("rejects a zero amount", () => {
    expect(createFailureCode(0, "EUR")).toBe("money.amountMinor.zero");
  });

  it("rejects an unknown currency", () => {
    expect(createFailureCode(1_000, "XXX")).toBe("money.currency.unsupported");
  });
});

describe("money equality", () => {
  it("considers two amounts in the same currency equal", () => {
    const first = Money.create(500, "USD");
    const second = Money.create(500, "USD");
    if (!isOk(first) || !isOk(second)) throw new Error("Expected both amounts to be accepted");
    expect(first.value.equals(second.value)).toBe(true);
  });

  it("considers the same amount in different currencies not equal", () => {
    const first = Money.create(500, "USD");
    const second = Money.create(500, "EUR");
    if (!isOk(first) || !isOk(second)) throw new Error("Expected both amounts to be accepted");
    expect(first.value.equals(second.value)).toBe(false);
  });
});
