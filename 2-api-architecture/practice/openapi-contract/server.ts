import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiDocument } from './openapi.ts';
import { apiRouter } from './router.ts';

const app = express();
app.use(express.json({ limit: '100kb' }));

const openApiDocument = buildOpenApiDocument();

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.get('/openapi.json', (_req, res) => res.json(openApiDocument));
app.use('/v1', apiRouter);

app.listen(3000, () => console.log('docs: http://localhost:3000/docs'));
