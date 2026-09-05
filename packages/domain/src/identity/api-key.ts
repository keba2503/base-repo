import { AggregateRoot } from "../kernel/aggregate-root";
import { classify, type FieldClassifications } from "../kernel/classification";
import { conflict, invariantViolation, type DomainError } from "../kernel/domain-error";
import type { DomainEvent } from "../kernel/domain-event";
import type { EntityId, TenantId } from "../kernel/identifiers";
import { err, ok, type Result } from "../kernel/result";
import { isPermissionAction, type PermissionAction } from "./role";

export type ApiKeySnapshot = {
  readonly id: EntityId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly keyPrefix: string;
  readonly keyHash: string;
  readonly scopes: readonly PermissionAction[];
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
};

export type ApiKeyCreatedPayload = {
  readonly apiKeyId: string;
  readonly keyPrefix: string;
  readonly scopes: readonly PermissionAction[];
};

export type ApiKeyRevokedPayload = {
  readonly apiKeyId: string;
  readonly keyPrefix: string;
};

export type ApiKeyCreated = DomainEvent<"apikey.created", ApiKeyCreatedPayload>;

export type ApiKeyRevoked = DomainEvent<"apikey.revoked", ApiKeyRevokedPayload>;

export type ApiKeyParts = {
  readonly keyPrefix: string;
  readonly secret: string;
};

export const apiKeyNameMinimumLength = 1;
export const apiKeyNameMaximumLength = 80;
export const apiKeyPrefixMarker = "ak_";
export const apiKeySeparator = ".";

const keyPrefixPattern = /^ak_[0-9a-f]{32}$/;

export const apiKeyFieldClassifications: FieldClassifications<ApiKeySnapshot> = classify<ApiKeySnapshot>({
  id: "none",
  tenantId: "none",
  name: "none",
  keyPrefix: "none",
  keyHash: "sensitive",
  scopes: "none",
  createdAt: "none",
  revokedAt: "none",
});

export function apiKeyPrefixOf(id: EntityId): string {
  return `${apiKeyPrefixMarker}${id.replaceAll("-", "")}`;
}

export function composeApiKey(parts: ApiKeyParts): string {
  return `${parts.keyPrefix}${apiKeySeparator}${parts.secret}`;
}

export function splitApiKey(plaintext: string): Result<ApiKeyParts, DomainError> {
  const separatorAt = plaintext.indexOf(apiKeySeparator);
  const keyPrefix = separatorAt === -1 ? "" : plaintext.slice(0, separatorAt);
  const secret = separatorAt === -1 ? "" : plaintext.slice(separatorAt + 1);
  if (!keyPrefixPattern.test(keyPrefix) || secret.length === 0) {
    return err(
      invariantViolation("apiKey.format", "An api key is a prefix and a secret separated by a dot"),
    );
  }
  return ok({ keyPrefix, secret });
}

function validateName(name: string): DomainError | undefined {
  if (name.length < apiKeyNameMinimumLength || name.length > apiKeyNameMaximumLength) {
    return invariantViolation(
      "apiKey.name.length",
      `An api key name must have between ${String(apiKeyNameMinimumLength)} and ${String(apiKeyNameMaximumLength)} characters`,
    );
  }
  return undefined;
}

function validateKeyPrefix(keyPrefix: string): DomainError | undefined {
  if (!keyPrefixPattern.test(keyPrefix)) {
    return invariantViolation(
      "apiKey.prefix.format",
      "An api key prefix is ak_ followed by the key id without hyphens",
    );
  }
  return undefined;
}

function validateKeyHash(keyHash: string): DomainError | undefined {
  if (keyHash.length === 0) {
    return invariantViolation("apiKey.hash.empty", "An api key must store the hash of its secret");
  }
  return undefined;
}

function validateScopes(scopes: readonly string[]): DomainError | undefined {
  if (scopes.length === 0) {
    return invariantViolation("apiKey.scopes.empty", "An api key must carry at least one scope");
  }
  if (new Set(scopes).size !== scopes.length) {
    return invariantViolation("apiKey.scopes.duplicate", "An api key must not repeat a scope");
  }
  if (!scopes.every(isPermissionAction)) {
    return invariantViolation("apiKey.scopes.unknown", "An api key scope must be a known permission action");
  }
  return undefined;
}

function validateRevocation(snapshot: ApiKeySnapshot): DomainError | undefined {
  if (snapshot.revokedAt !== null && snapshot.revokedAt.getTime() < snapshot.createdAt.getTime()) {
    return invariantViolation(
      "apiKey.revokedAt.beforeCreation",
      "An api key cannot be revoked before it was created",
    );
  }
  return undefined;
}

export class ApiKey extends AggregateRoot {
  readonly id: EntityId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly keyPrefix: string;
  readonly keyHash: string;
  readonly scopes: readonly PermissionAction[];
  readonly createdAt: Date;
  #revokedAt: Date | null;

  private constructor(snapshot: ApiKeySnapshot) {
    super();
    this.id = snapshot.id;
    this.tenantId = snapshot.tenantId;
    this.name = snapshot.name;
    this.keyPrefix = snapshot.keyPrefix;
    this.keyHash = snapshot.keyHash;
    this.scopes = [...snapshot.scopes];
    this.createdAt = snapshot.createdAt;
    this.#revokedAt = snapshot.revokedAt;
  }

  get revokedAt(): Date | null {
    return this.#revokedAt;
  }

  get isRevoked(): boolean {
    return this.#revokedAt !== null;
  }

  static create(snapshot: Omit<ApiKeySnapshot, "revokedAt">): Result<ApiKey, DomainError> {
    const restored = ApiKey.restore({ ...snapshot, revokedAt: null });
    if (restored.kind === "err") return restored;
    const apiKey = restored.value;
    apiKey.record({
      name: "apikey.created",
      tenantId: apiKey.tenantId,
      occurredAt: apiKey.createdAt,
      payload: { apiKeyId: apiKey.id, keyPrefix: apiKey.keyPrefix, scopes: apiKey.scopes },
    });
    return ok(apiKey);
  }

  static restore(snapshot: ApiKeySnapshot): Result<ApiKey, DomainError> {
    const name = snapshot.name.trim();
    const invalid =
      validateName(name) ??
      validateKeyPrefix(snapshot.keyPrefix) ??
      validateKeyHash(snapshot.keyHash) ??
      validateScopes(snapshot.scopes) ??
      validateRevocation(snapshot);
    if (invalid) return err(invalid);
    return ok(new ApiKey({ ...snapshot, name }));
  }

  revoke(at: Date): Result<void, DomainError> {
    if (this.#revokedAt !== null) {
      return err(conflict("apiKey.alreadyRevoked", "This api key was already revoked"));
    }
    if (at.getTime() < this.createdAt.getTime()) {
      return err(
        invariantViolation(
          "apiKey.revokedAt.beforeCreation",
          "An api key cannot be revoked before it was created",
        ),
      );
    }
    this.#revokedAt = at;
    this.record({
      name: "apikey.revoked",
      tenantId: this.tenantId,
      occurredAt: at,
      payload: { apiKeyId: this.id, keyPrefix: this.keyPrefix },
    });
    return ok(undefined);
  }

  toSnapshot(): ApiKeySnapshot {
    return {
      id: this.id,
      tenantId: this.tenantId,
      name: this.name,
      keyPrefix: this.keyPrefix,
      keyHash: this.keyHash,
      scopes: [...this.scopes],
      createdAt: this.createdAt,
      revokedAt: this.#revokedAt,
    };
  }
}
