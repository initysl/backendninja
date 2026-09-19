import type { z } from 'zod';
import { wttrResponseSchema } from '../schemas/external-api.schema.ts';

// Derived from the schema, never declared by hand
export type WeatherData = z.infer<typeof wttrResponseSchema>;
