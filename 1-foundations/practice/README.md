## Exercise — Typing an untrusted response at the boundary

> Take a messy third-party JSON response, validate it at the boundary with a Zod
> schema, and derive every downstream type with `z.infer` so nothing is declared
> twice.

### What it does

Fetches the current weather for a location from [wttr.in](https://wttr.in), a
free API that returns deliberately awkward JSON, and turns it into a clean typed
object.

The raw response is hostile in three specific ways, which is what makes it a
good subject:

- **Numbers arrive as strings.** `"temp_C": "18"`, not `18`.
- **Single values are wrapped in arrays.** The current conditions are
  `current_condition: [ { … } ]` — an array that always has exactly one entry.
- **Text values are doubly wrapped.** `weatherDesc: [ { "value": "Clear" } ]`.

The schema absorbs all of that at the boundary. Everything downstream sees:

```ts
{
  location: 'Greenwich Village, United States of America',
  temperatureCelsius: 17,
  feelsLikeCelsius: 13,
  humidityPercent: 44,
  condition: 'Clear ',
  uvIndex: 0
}
```

### Running it

From the repository root:

```bash
npm start -w foundations-practice              # defaults to New York
npm start -w foundations-practice -- Lagos     # pass a location
npm run typecheck -w foundations-practice
```

From this folder:

```bash
node src/index.ts
node src/index.ts Berlin
npm run dev            # re-runs on save
```

No build step and no `tsx` — Node 24 strips the types itself. It needs a network
connection, since it calls the real API.

### Layout

```
src/
├── index.ts                        entrypoint: reads the location, prints the result
├── services/external-api.service.ts  fetches, checks the response, validates
├── schemas/external-api.schema.ts    the Zod schema and its transforms
└── types/external-api.ts             WeatherData, derived with z.infer
```

The dependency direction is one way: `index → service → schema`. The type file
derives from the schema, so the validation and the type can never disagree.

### What it demonstrates

**Parse, don't validate.** The schema does not check that the response is
acceptable and pass the original through — it _transforms_ unknown input into a
known shape, and the untransformed version stops existing at that line.

**One source of truth for types.** `WeatherData` is `z.infer<typeof
wttrResponseSchema>`. Writing an interface by hand alongside a schema guarantees
the two drift, and the compiler never tells you.

**`typeof schema` is not the parsed type.** It is the type of the schema object
— a `ZodPipe`. The parsed shape only comes from `z.infer`.

**`fetch` does not throw on 404 or 500.** It only rejects on network failure, so
`response.ok` has to be checked explicitly. Without it, a wttr.in error page
surfaces as a confusing JSON parse failure instead of "the API returned 500".

**`safeParse` over `parse`.** A `ZodError` carries per-field issues — which
field, which rule. Catching it and rethrowing a generic message discards the
only useful part of the failure.

**An empty array is a real case.** `.transform(items => items[0])` yields
`undefined` when the array is empty, and the flattening transform then throws a
`TypeError`. A `.min(1)` before the transform turns a crash into a clean
validation error.

**`import type` is load-bearing.** Node strips types without a type checker, so
a plain `import { WeatherData }` of a type-only export survives to runtime and
fails to resolve. Relative imports also need the explicit `.ts` extension — ESM
does no extension guessing.
