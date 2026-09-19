import { z } from 'zod';

// Helper schema for nested objects arrays
const valueArraySchema = z
  .array(z.object({ value: z.string() }))
  .transform((items) => items[0]?.value ?? 'Unknown');

export const wttrResponseSchema = z
  .object({
    current_condition: z
      .array(
        z.object({
          temp_C: z.coerce.number(),
          FeelsLikeC: z.coerce.number(),
          humidity: z.coerce.number(),
          weatherDesc: valueArraySchema,
          uvIndex: z.coerce.number(),
        }),
      )
      // .min(1) before .transform: an empty array would otherwise yield
      // undefined here and crash the flattening transform below with a
      // TypeError, instead of failing as a clean validation error.
      .min(1, 'wttr.in returned no current_condition entries')
      .transform((items) => items[0]!),
    nearest_area: z
      .array(
        z.object({
          areaName: valueArraySchema,
          country: valueArraySchema,
        }),
      )
      .min(1, 'wttr.in returned no nearest_area entries')
      .transform((items) => items[0]!),
  })
  // Flatten and sanitize into a clean, predictable downstream format
  .transform((data) => ({
    location: `${data.nearest_area.areaName}, ${data.nearest_area.country}`,
    temperatureCelsius: data.current_condition.temp_C,
    feelsLikeCelsius: data.current_condition.FeelsLikeC,
    humidityPercent: data.current_condition.humidity,
    condition: data.current_condition.weatherDesc,
    uvIndex: data.current_condition.uvIndex,
  }));

// Note: `typeof wttrResponseSchema` would be the type of the *schema object*
// (a ZodPipe), not of the parsed data. The parsed shape is `WeatherData` in
// types/external-api.ts, derived with z.infer.
