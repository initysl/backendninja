import { wttrResponseSchema } from '../schemas/external-api.schema.ts';
import type { WeatherData } from '../types/external-api.ts';

export async function fetchWeatherData(location: string): Promise<WeatherData> {
  const response = await fetch(
    `https://wttr.in/${encodeURIComponent(location)}?format=j1`,
  );

  if (!response.ok) {
    throw new Error(
      `wttr.in returned ${response.status} ${response.statusText} for "${location}".`,
    );
  }

  const rawData: unknown = await response.json();
  const result = wttrResponseSchema.safeParse(rawData);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');

    throw new Error(`Unexpected response shape from wttr.in - ${issues}`, {
      cause: result.error,
    });
  }

  return result.data;
}
