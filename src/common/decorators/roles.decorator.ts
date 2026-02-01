import { SetMetadata } from '@nestjs/common';
import { Role } from '../constants/roles';

export const ROLES_KEY = 'roles';

/**
 * Decorator for RBAC - specify allowed roles for a route.
 * Usage: @Roles(Role.TENANT_ADMIN, Role.MANAGER)
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
