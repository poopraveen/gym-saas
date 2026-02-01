import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * Resolves tenant context for every request.
 * Extracts X-Tenant-ID header or tenant from JWT and sets request.tenantId.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const tenantId =
      request.headers['x-tenant-id'] ||
      request.user?.tenantId;

    if (!tenantId && request.user) {
      throw new ForbiddenException('Tenant context required');
    }

    request.tenantId = tenantId;
    return true;
  }
}
