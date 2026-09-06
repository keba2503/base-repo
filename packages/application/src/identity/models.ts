import { resourceOfAction } from "@base/domain";
import type { Actor } from "../kernel/actor";

export type ResolveActorFromSessionRequest = {
  readonly token: string;
  readonly tenantSlug?: string | undefined;
  readonly tenantId?: string | undefined;
};

export type ResolveActorFromApiKeyRequest = {
  readonly key: string;
};

export type CreateApiKeyRequest = {
  readonly actor: Actor;
  readonly name: string;
  readonly scopes: readonly string[];
};

export type RevokeApiKeyRequest = {
  readonly actor: Actor;
  readonly apiKeyId: string;
};

export type RegisterUserRequest = {
  readonly actor: Actor;
  readonly subjectId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: string;
};

export type ApiKeyResponse = {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly scopes: readonly string[];
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
};

export type ApiKeyCreatedResponse = ApiKeyResponse & {
  readonly plaintextKey: string;
};

export type UserResponse = {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: string;
  readonly createdAt: Date;
};

export const manageApiKeysAction = "apikeys:manage";
export const manageMembersAction = "members:manage";
export const apiKeyResource = resourceOfAction(manageApiKeysAction);
export const memberResource = resourceOfAction(manageMembersAction);
