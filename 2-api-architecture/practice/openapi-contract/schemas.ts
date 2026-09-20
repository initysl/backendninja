import { z } from 'zod';

export const ProductSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  price: z.number().positive(),
  tags: z.array(z.string().min(1)).max(10).default([]),
});

// Clients never send the id - the server owns it.
export const CreateProductSchema = ProductSchema.omit({ id: true });

export const ProductParamsSchema = z.object({ id: z.uuid() });

export const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().min(1).optional(),
});

export const ProductListSchema = z.object({
  data: z.array(ProductSchema),
  total: z.number().int().nonnegative(),
});

export const ProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
});
