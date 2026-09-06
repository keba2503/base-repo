import { describe, expect, it } from "bun:test";
import { isOk } from "../src/kernel/result";
import { User, userFieldClassifications } from "../src/identity/user";
import { Membership, membershipFieldClassifications } from "../src/identity/membership";
import { membershipSnapshotFactory, userSnapshotFactory } from "./factories/identity";

function registerFailureCode(snapshot: Parameters<typeof User.register>[0]): string {
  const result = User.register(snapshot);
  if (isOk(result)) throw new Error("Expected the user to be rejected");
  return result.error.code;
}

describe("user registration", () => {
  it("accepts a valid user", () => {
    expect(isOk(User.register(userSnapshotFactory()))).toBe(true);
  });

  it("trims the display name", () => {
    const result = User.register(userSnapshotFactory({ displayName: "  Karen  " }));
    if (!isOk(result)) throw new Error("Expected the user to be accepted");
    expect(result.value.displayName).toBe("Karen");
  });

  it("records a registration event", () => {
    const result = User.register(userSnapshotFactory());
    if (!isOk(result)) throw new Error("Expected the user to be accepted");
    expect(result.value.pullEvents()).toEqual([
      {
        name: "user.registered",
        tenantId: result.value.tenantId,
        occurredAt: result.value.createdAt,
        payload: { userId: result.value.id, tenantId: result.value.tenantId },
      },
    ]);
  });

  it("rejects an empty display name", () => {
    expect(registerFailureCode(userSnapshotFactory({ displayName: "   " }))).toBe("user.displayName.length");
  });

  it("rejects a display name longer than eighty characters", () => {
    expect(registerFailureCode(userSnapshotFactory({ displayName: "a".repeat(81) }))).toBe(
      "user.displayName.length",
    );
  });
});

describe("user restoration", () => {
  it("does not record an event", () => {
    const result = User.restore(userSnapshotFactory());
    if (!isOk(result)) throw new Error("Expected the user to be accepted");
    expect(result.value.pullEvents()).toEqual([]);
  });

  it("round trips through its snapshot", () => {
    const snapshot = userSnapshotFactory();
    const result = User.restore(snapshot);
    if (!isOk(result)) throw new Error("Expected the user to be accepted");
    expect(result.value.toSnapshot()).toEqual(snapshot);
  });
});

describe("user data classification", () => {
  it("declares the email and the display name as personal data", () => {
    expect([userFieldClassifications.email, userFieldClassifications.displayName]).toEqual([
      "personal",
      "personal",
    ]);
  });
});

describe("membership", () => {
  it("grants a membership with a known role", () => {
    expect(isOk(Membership.grant(membershipSnapshotFactory({ role: "admin" })))).toBe(true);
  });

  it("rejects an unknown role", () => {
    const result = Membership.restore({ ...membershipSnapshotFactory(), role: "superuser" as "member" });
    if (isOk(result)) throw new Error("Expected the membership to be rejected");
    expect(result.error.code).toBe("membership.role.unknown");
  });

  it("round trips through its snapshot", () => {
    const snapshot = membershipSnapshotFactory({ role: "owner" });
    const result = Membership.grant(snapshot);
    if (!isOk(result)) throw new Error("Expected the membership to be accepted");
    expect(result.value.toSnapshot()).toEqual(snapshot);
  });

  it("holds no personal data", () => {
    expect(Object.values(membershipFieldClassifications).every((value) => value === "none")).toBe(true);
  });
});
