import { parseEntityId, type EntityId } from "../../src/kernel/identifiers";
import { isOk } from "../../src/kernel/result";
import { apiKeyPrefixOf, type ApiKeySnapshot } from "../../src/identity/api-key";
import { parseEmail, type Email } from "../../src/identity/email";
import type { MembershipSnapshot } from "../../src/identity/membership";
import type { UserSnapshot } from "../../src/identity/user";
import { tenantIdFactory } from "./tenant";

export function entityIdFactory(sequence: number): EntityId {
  const suffix = sequence.toString(16).padStart(12, "0");
  const parsed = parseEntityId(`00000000-0000-4000-8000-${suffix}`);
  if (!isOk(parsed)) throw new Error("The entity id factory produced an invalid identifier");
  return parsed.value;
}

export function emailFactory(value = "karen@example.com"): Email {
  const parsed = parseEmail(value);
  if (!isOk(parsed)) throw new Error("The email factory produced an invalid email");
  return parsed.value;
}

export function userSnapshotFactory(overrides: Partial<UserSnapshot> = {}): UserSnapshot {
  return {
    id: entityIdFactory(10),
    tenantId: tenantIdFactory(1),
    email: emailFactory(),
    displayName: "Karen",
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
    ...overrides,
  };
}

export function membershipSnapshotFactory(overrides: Partial<MembershipSnapshot> = {}): MembershipSnapshot {
  return {
    userId: entityIdFactory(10),
    tenantId: tenantIdFactory(1),
    role: "member",
    ...overrides,
  };
}

export function apiKeySnapshotFactory(overrides: Partial<ApiKeySnapshot> = {}): ApiKeySnapshot {
  const id = overrides.id ?? entityIdFactory(20);
  return {
    id,
    tenantId: tenantIdFactory(1),
    name: "Integration",
    keyPrefix: apiKeyPrefixOf(id),
    keyHash: "hashed-secret",
    scopes: ["tenants:read"],
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
    revokedAt: null,
    ...overrides,
  };
}
