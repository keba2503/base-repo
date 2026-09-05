import type { Actor } from "../actor";

export type PermissionRequest = {
  readonly actor: Actor;
  readonly action: string;
  readonly resource: string;
};

export type Permissions = {
  can(request: PermissionRequest): Promise<boolean>;
};
