import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): { id: string } => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user!;
  },
);
