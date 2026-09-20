import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import {
  CreateProductSchema,
  ListQuerySchema,
  ProblemSchema,
  ProductListSchema,
  ProductParamsSchema,
  ProductSchema,
} from './schemas.ts';

export type RouteDescriptor = {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string; // Express style: /products/:id
  operationId: string;
  summary: string;
  request?: { params?: ZodType; query?: ZodType; body?: ZodType };
  responses: Record<number, { description: string; schema?: ZodType }>;
  handler: RequestHandler;
};

type Product = ReturnType<typeof ProductSchema.parse>;

const products = new Map<string, Product>();

export const routes: RouteDescriptor[] = [
  {
    method: 'get',
    path: '/products',
    operationId: 'listProducts',
    summary: 'List products',
    request: { query: ListQuerySchema },
    responses: {
      200: { description: 'A page of products', schema: ProductListSchema },
    },
    handler: (_req, res) => {
      const { limit, q } = res.locals.validated.query;
      let items = [...products.values()];
      if (q)
        items = items.filter((p) =>
          p.name.toLowerCase().includes(q.toLowerCase()),
        );
      res
        .status(200)
        .json({ data: items.slice(0, limit), total: items.length });
    },
  },
  {
    method: 'post',
    path: '/products',
    operationId: 'createProduct',
    summary: 'Create a product',
    request: { body: CreateProductSchema },
    responses: {
      201: { description: 'Created', schema: ProductSchema },
      422: { description: 'Validation failed', schema: ProblemSchema },
    },
    handler: (_req, res) => {
      const product = { id: randomUUID(), ...res.locals.validated.body };
      products.set(product.id, product);
      res.status(201).location(`/v1/products/${product.id}`).json(product);
    },
  },
  {
    method: 'get',
    path: '/products/:id',
    operationId: 'getProduct',
    summary: 'Fetch one product',
    request: { params: ProductParamsSchema },
    responses: {
      200: { description: 'The product', schema: ProductSchema },
      404: { description: 'No such product', schema: ProblemSchema },
    },
    handler: (_req, res) => {
      const product = products.get(res.locals.validated.params.id);
      if (!product) {
        res.status(404).type('application/problem+json').json({
          type: '/problems/not_found',
          title: 'Not Found',
          status: 404,
          detail: 'No product with that id.',
        });
        return;
      }
      res.status(200).json(product);
    },
  },
];
