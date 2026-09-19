import process from 'process';
import { fetchWeatherData } from './services/external-api.service.ts';

async function main() {
  const location = process.argv[2] ?? 'New York';

  try {
    const weatherData = await fetchWeatherData(location);
    console.log('Weather Data:', weatherData);
  } catch (error) {
    console.error(
      'Error fetching weather data:',
      error instanceof Error ? error.message : error,
    );
    // Exit non-zero so a script or CI run can tell this failed.
    process.exitCode = 1;
  }
}

await main();
