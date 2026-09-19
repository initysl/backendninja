import type { z } from 'zod';
import { wttrResponseSchema } from '../schemas/external-api.schema.ts';

// Derived from the schema, never declared by hand — so the type and the
// validation can never drift apart.
export type WeatherData = z.infer<typeof wttrResponseSchema>;
