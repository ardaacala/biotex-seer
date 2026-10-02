import { z } from 'zod';
import { insertUserSchema, insertRecordSchema, users, productionRecords } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  })
};

export const api = {
  auth: {
    login: {
      method: 'POST' as const,
      path: '/api/auth/login' as const,
      input: z.object({ username: z.string(), password: z.string() }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
        403: z.object({ message: z.string() }),
      },
    },
    register: {
      method: 'POST' as const,
      path: '/api/auth/register' as const,
      input: z.object({ username: z.string(), password: z.string(), role: z.enum(['admin', 'user']).optional() }),
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    me: {
      method: 'GET' as const,
      path: '/api/auth/me' as const,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/auth/logout' as const,
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
  },
  users: {
    list: {
      method: 'GET' as const,
      path: '/api/users' as const,
      responses: {
        200: z.array(z.custom<typeof users.$inferSelect>()),
        401: errorSchemas.unauthorized,
      }
    }
  },
  records: {
    list: {
      method: 'GET' as const,
      path: '/api/records' as const,
      input: z.object({
        search: z.string().optional(),
        status: z.string().optional(),
      }).optional(),
      responses: {
        // List endpoint strips photo fields and adds hasPhoto flag for lazy loading.
        200: z.array(z.custom<typeof productionRecords.$inferSelect & { hasPhoto?: boolean }>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/records/:id' as const,
      responses: {
        200: z.custom<typeof productionRecords.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/records' as const,
      input: insertRecordSchema,
      responses: {
        201: z.custom<typeof productionRecords.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/records/:id' as const,
      input: insertRecordSchema.partial().extend({
        clientUpdatedAt: z.string().optional(),
      }),
      responses: {
        200: z.custom<typeof productionRecords.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
        409: z.object({ message: z.string() }),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/records/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
