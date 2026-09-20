import { z, type ZodType } from 'zod';
import { routes } from './descriptors.ts';

type Json = Record<string, unknown>;

function toJson(schema: ZodType, io: 'input' | 'output'): Json {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io,
  }) as Json;
  return rest;
}

const toOpenApiPath = (path: string) =>
  path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

// OpenAPI wants one entry per parameter, so expand the object's properties.
function toParameters(schema: ZodType, location: 'path' | 'query') {
  const json = toJson(schema, 'input');
  const required = new Set((json.required as string[] | undefined) ?? []);
  const properties =
    (json.properties as Record<string, Json> | undefined) ?? {};

  return Object.entries(properties).map(([name, propertySchema]) => ({
    name,
    in: location,
    // A path parameter is required by definition — it is part of the URL.
    required: location === 'path' ? true : required.has(name),
    schema: propertySchema,
  }));
}

export function buildOpenApiDocument(): Json {
  const paths: Record<string, Json> = {};

  for (const route of routes) {
    const operation: Json = {
      operationId: route.operationId,
      summary: route.summary,
    };

    const parameters = [
      ...(route.request?.params
        ? toParameters(route.request.params, 'path')
        : []),
      ...(route.request?.query
        ? toParameters(route.request.query, 'query')
        : []),
    ];
    if (parameters.length > 0) operation.parameters = parameters;

    if (route.request?.body) {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': { schema: toJson(route.request.body, 'input') },
        },
      };
    }

    operation.responses = Object.fromEntries(
      Object.entries(route.responses).map(([status, response]) => [
        status,
        {
          description: response.description,
          ...(response.schema
            ? {
                content: {
                  'application/json': {
                    schema: toJson(response.schema, 'output'),
                  },
                },
              }
            : {}),
        },
      ]),
    );

    const path = toOpenApiPath(route.path);
    paths[path] = { ...paths[path], [route.method]: operation };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Products API',
      version: '1.0.0',
      description:
        'Generated from Zod schemas. Do not edit openapi.json by hand.',
    },
    servers: [{ url: 'http://localhost:3000/v1' }],
    paths,
  };
}
