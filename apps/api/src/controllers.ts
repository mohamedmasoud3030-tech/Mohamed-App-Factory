/**
 * Thin REST controllers (ADR-0006). Business logic lives in the engines;
 * controllers only: authenticate → authorize → validate → call engine.
 */
import { Body, Controller, Get, Inject, NotFoundException, Param, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DEPS, type Deps } from './deps.js';
import { parseBody, requireContext, toHttp } from './http.js';
import { permissionsOf } from '../../../engines/platform/src/auth/permissions.js';
import { createSaleSchema } from '../../../engines/transactions/src/contracts.js';
import { getSale, recordSale } from '../../../engines/transactions/src/sale-service.js';
import { listCatalog } from '../../../engines/catalog/src/catalog-service.js';
import { organization } from '../../../engines/platform/src/auth/schema.js';
import { eq } from 'drizzle-orm';

@ApiTags('platform')
@Controller('api')
export class HealthController {
  @Get('health')
  health() {
    return { ok: true };
  }
}

@ApiTags('platform')
@Controller('api/v1')
export class MeController {
  constructor(@Inject(DEPS) private readonly deps: Deps) {}

  @Get('me')
  @ApiOperation({ summary: 'Current user, active tenant, role and permissions' })
  async me(@Req() req: FastifyRequest) {
    const ctx = await requireContext(this.deps, req);
    const [org] = await this.deps.db
      .select({ name: organization.name, slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, ctx.tenantId));
    return {
      user: { id: ctx.userId, name: ctx.userName, email: ctx.userEmail },
      tenant: { id: ctx.tenantId, name: org?.name, slug: org?.slug },
      role: ctx.role,
      permissions: permissionsOf(ctx.role),
    };
  }
}

@ApiTags('catalog')
@Controller('api/v1/catalog')
export class CatalogController {
  constructor(@Inject(DEPS) private readonly deps: Deps) {}

  @Get('items')
  @ApiOperation({ summary: 'Sellable catalog for the active tenant (with stock state)' })
  async items(@Req() req: FastifyRequest) {
    const ctx = await requireContext(this.deps, req, { catalog: ['read'] });
    return { items: await listCatalog(this.deps.db, ctx.tenantId) };
  }
}

@ApiTags('sales')
@Controller('api/v1/sales')
export class SalesController {
  constructor(@Inject(DEPS) private readonly deps: Deps) {}

  @Post()
  @ApiOperation({ summary: 'Record a sale (idempotent; prices come from the catalog)' })
  @ApiBody({ schema: z.toJSONSchema(createSaleSchema) as Record<string, unknown> })
  async create(@Req() req: FastifyRequest, @Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const ctx = await requireContext(this.deps, req, { sale: ['create'] });
    const input = parseBody(createSaleSchema, body);
    try {
      const { sale, replayed } = await recordSale(this.deps.db, { tenantId: ctx.tenantId, userId: ctx.userId }, input);
      reply.status(replayed ? 200 : 201);
      return { sale, replayed };
    } catch (e) {
      throw toHttp(e);
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read a saved sale (receipt data)' })
  async get(@Req() req: FastifyRequest, @Param('id') id: string) {
    const ctx = await requireContext(this.deps, req, { sale: ['read'] });
    const sale = await getSale(this.deps.db, ctx.tenantId, id);
    if (!sale) throw new NotFoundException({ error: 'not_found', message: 'الفاتورة غير موجودة' });
    return { sale };
  }
}
