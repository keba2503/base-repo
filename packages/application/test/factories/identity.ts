import {
  ApiKey,
  apiKeyPrefixOf,
  isOk,
  Membership,
  parseEmail,
  parseEntityId,
  User,
  type ApiKeySnapshot,
  type Email,
  type EntityId,
  type MembershipSnapshot,
  type UserSnapshot,
} from "@base/domain";
import { tenantIdFactory } from "./actor";

export function entityIdFactory(sequence: number): EntityId {
  const parsed = parseEntityId(`00000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`);
  if (!isOk(parsed)) throw new Error("The entity id factory produced an invalid identifier");
  return parsed.value;
}

export function emailFactory(value = "karen@example.com"): Email {
  const parsed = parseEmail(value);
  if (!isOk(parsed)) throw new Error("The email factory produced an invalid email");
  return parsed.value;
}

export function userFactory(overrides: Partial<UserSnapshot> = {}): User {
  const restored = User.restore({
    id: entityIdFactory(10),
    tenantId: tenantIdFactory(900),
    email: emailFactory(),
    displayName: "Karen",
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
    ...overrides,
  });
  if (!isOk(restored)) throw new Error("The user factory produced an invalid user");
  return restored.value;
}

export function membershipFactory(overrides: Partial<MembershipSnapshot> = {}): Membership {
  const granted = Membership.grant({
    userId: entityIdFactory(10),
    tenantId: tenantIdFactory(900),
    role: "member",
    ...overrides,
  });
  if (!isOk(granted)) throw new Error("The membership factory produced an invalid membership");
  return granted.value;
}

export function apiKeyFactory(overrides: Partial<ApiKeySnapshot> = {}): ApiKey {
  const id = overrides.id ?? entityIdFactory(20);
  const restored = ApiKey.restore({
    id,
    tenantId: tenantIdFactory(900),
    name: "Integration",
    keyPrefix: apiKeyPrefixOf(id),
    keyHash: "hashed-secret",
    scopes: ["tenants:read"],
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
    revokedAt: null,
    ...overrides,
  });
  if (!isOk(restored)) throw new Error("The api key factory produced an invalid api key");
  return restored.value;
}
