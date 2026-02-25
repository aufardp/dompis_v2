// app/libs/rolesUtil.ts

export const ADMIN_ROLES = [
  'admin',
  'helpdesk',
  'superadmin',
  'super_admin',
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export function isAdminRole(role: string): role is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}
