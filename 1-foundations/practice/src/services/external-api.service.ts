import { wttrResponseSchema } from '../schemas/external-api.schema.ts';
// `import type` is required: Node strips types without a type checker, so a
// plain import of a type-only export survives to runtime and fails to resolve.
import type { WeatherData } from '../types/external-api.ts';

export async function fetchWeatherData(location: string): Promise<WeatherData> {
  const response = await fetch(
    `https://wttr.in/${encodeURIComponent(location)}?format=j1`,
  );

  // fetch only rejects on network failure — a 404 or 500 resolves normally.
  if (!response.ok) {
    throw new Error(
      `wttr.in returned ${response.status} ${response.statusText} for "${location}".`,
    );
  }

  const body: unknown = await response.json();
  const result = wttrResponseSchema.safeParse(body);

  if (!result.success) {
    // The per-field issues are the whole reason to use Zod here; throwing a
    // generic message discards the only useful part of the failure.
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');

    throw new Error(`Unexpected response shape from wttr.in — ${issues}`);
  }

  return result.data;
}
