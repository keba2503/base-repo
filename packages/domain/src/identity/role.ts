export const permissionActions = [
  "tenants:create",
  "tenants:read",
  "apikeys:manage",
  "members:manage",
] as const;

export type PermissionAction = (typeof permissionActions)[number];

export const roles = ["owner", "admin", "member"] as const;

export type Role = (typeof roles)[number];

export const permissionMatrix: Readonly<Record<Role, readonly PermissionAction[]>> = Object.freeze({
  owner: ["tenants:create", "tenants:read", "apikeys:manage", "members:manage"],
  admin: ["tenants:read", "apikeys:manage", "members:manage"],
  member: ["tenants:read"],
});

export function isRole(value: string): value is Role {
  return roles.some((role) => role === value);
}

export function isPermissionAction(value: string): value is PermissionAction {
  return permissionActions.some((action) => action === value);
}

export function roleAllows(request: { readonly role: Role; readonly action: string }): boolean {
  return permissionMatrix[request.role].some((allowed) => allowed === request.action);
}

export const permissionResources = ["tenant", "apiKey", "member"] as const;

export type PermissionResource = (typeof permissionResources)[number];

export function resourceOfAction(action: PermissionAction): PermissionResource {
  switch (action) {
    case "tenants:create":
    case "tenants:read":
      return "tenant";
    case "apikeys:manage":
      return "apiKey";
    case "members:manage":
      return "member";
  }
}

export function actionsOf(role: Role): readonly PermissionAction[] {
  return permissionMatrix[role];
}
