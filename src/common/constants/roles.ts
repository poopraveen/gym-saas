/**
 * System roles - never hardcode tenant-specific logic.
 * Tenant admins can assign these roles to their users.
 */
export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',   // Platform admin - manages tenants
  TENANT_ADMIN = 'TENANT_ADMIN', // Gym owner - full access within tenant
  MANAGER = 'MANAGER',           // Can manage members, attendance
  STAFF = 'STAFF',               // Can check-in, limited access
  TRAINER = 'TRAINER',           // Nutrition AI + onboard members only
  MEMBER = 'MEMBER',             // Gym member - self-service only
}

export const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.SUPER_ADMIN]: 100,
  [Role.TENANT_ADMIN]: 90,
  [Role.MANAGER]: 70,
  [Role.STAFF]: 50,
  [Role.TRAINER]: 55,
  [Role.MEMBER]: 10,
};
