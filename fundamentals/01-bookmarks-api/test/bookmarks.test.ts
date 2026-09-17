import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.ts';
import * as repository from '../src/repositories/bookmark.repository.ts';

const app = createApp();

const valid = {
  url: 'https://nodejs.org',
  title: 'Node.js',
  description: 'The JavaScript runtime',
  tags: ['node', 'javascript'],
};

beforeEach(() => {
  repository.reset();
});

describe('health', () => {
  it('reports ok', async () => {
    const response = await request(app).get('/health').expect(200);
    assert.equal(response.body.status, 'ok');
  });
});

describe('POST /v1/bookmarks', () => {
  it('creates a bookmark and returns 201 with a Location header', async () => {
    const response = await request(app)
      .post('/v1/bookmarks')
      .send(valid)
      .expect(201);

    assert.match(response.headers.location, /^\/v1\/bookmarks\/[0-9a-f-]{36}$/);
    assert.equal(response.body.url, valid.url);
    assert.equal(response.body.favorite, false, 'favorite defaults to false');
    assert.deepEqual(response.body.tags, valid.tags);
    assert.ok(response.body.createdAt, 'the server owns the timestamps');
  });

  it('rejects a duplicate URL with 409', async () => {
    await request(app).post('/v1/bookmarks').send(valid).expect(201);

    const response = await request(app)
      .post('/v1/bookmarks')
      .send({ ...valid, title: 'Different title' })
      .expect(409);

    assert.equal(response.body.code, 'conflict');
  });

  it('rejects invalid input with 422 and a per-field error list', async () => {
    const response = await request(app)
      .post('/v1/bookmarks')
      .send({ url: 'not-a-url' })
      .expect(422)
      .expect('Content-Type', /application\/problem\+json/);

    assert.equal(response.body.code, 'validation_failed');
    assert.ok(Array.isArray(response.body.errors));

    const fields = response.body.errors.map(
      (issue: { field: string }) => issue.field,
    );
    assert.ok(fields.includes('body.url'));
    assert.ok(
      fields.includes('body.title'),
      'a missing required field is reported',
    );
  });

  it('rejects an unknown key rather than silently ignoring it', async () => {
    const response = await request(app)
      .post('/v1/bookmarks')
      .send({ ...valid, titel: 'typo' })
      .expect(422);

    const codes = response.body.errors.map(
      (issue: { code: string }) => issue.code,
    );
    assert.ok(codes.includes('unrecognized_keys'));
  });

  it('rejects a malformed JSON body with 400 in the same envelope', async () => {
    const response = await request(app)
      .post('/v1/bookmarks')
      .set('Content-Type', 'application/json')
      .send('{"url":')
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    assert.equal(response.body.code, 'malformed_json');
  });
});

describe('GET /v1/bookmarks', () => {
  beforeEach(async () => {
    await request(app).post('/v1/bookmarks').send(valid);
    await request(app)
      .post('/v1/bookmarks')
      .send({
        url: 'https://expressjs.com',
        title: 'Express',
        tags: ['node'],
        favorite: true,
      });
  });

  it('returns a page with pagination metadata', async () => {
    const response = await request(app).get('/v1/bookmarks').expect(200);

    assert.equal(response.body.data.length, 2);
    assert.equal(response.body.pagination.total, 2);
    assert.equal(response.body.pagination.page, 1);
    assert.equal(response.body.pagination.hasNext, false);
  });

  it('returns 200 and an empty array when nothing matches, not 404', async () => {
    const response = await request(app)
      .get('/v1/bookmarks?q=nothingmatchesthis')
      .expect(200);

    assert.deepEqual(response.body.data, []);
    assert.equal(response.body.pagination.total, 0);
  });

  it('filters by tag and by favorite', async () => {
    const byFavorite = await request(app)
      .get('/v1/bookmarks?favorite=true')
      .expect(200);
    assert.equal(byFavorite.body.data.length, 1);
    assert.equal(byFavorite.body.data[0].title, 'Express');

    const byTag = await request(app)
      .get('/v1/bookmarks?tag=javascript')
      .expect(200);
    assert.equal(byTag.body.data.length, 1);
  });

  it('sorts and paginates', async () => {
    const response = await request(app)
      .get('/v1/bookmarks?sort=title&limit=1&page=2')
      .expect(200);

    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].title, 'Node.js');
    assert.equal(response.body.pagination.hasPrevious, true);
  });

  it('rejects an unknown query parameter', async () => {
    await request(app).get('/v1/bookmarks?limitt=5').expect(422);
  });

  it('rejects a page size above the maximum', async () => {
    await request(app).get('/v1/bookmarks?limit=5000').expect(422);
  });
});

describe('GET /v1/bookmarks/:id', () => {
  it('returns 404 for an id that does not exist', async () => {
    const response = await request(app)
      .get('/v1/bookmarks/3fa85f64-5717-4562-b3fc-2c963f66afa6')
      .expect(404);

    assert.equal(response.body.code, 'not_found');
  });

  it('returns 422 for an id that is not a UUID', async () => {
    await request(app).get('/v1/bookmarks/not-a-uuid').expect(422);
  });
});

describe('updating and deleting', () => {
  let id: string;

  beforeEach(async () => {
    const created = await request(app).post('/v1/bookmarks').send(valid);
    id = created.body.id;
  });

  it('applies a partial update with PATCH', async () => {
    const response = await request(app)
      .patch(`/v1/bookmarks/${id}`)
      .send({ favorite: true })
      .expect(200);

    assert.equal(response.body.favorite, true);
    assert.equal(response.body.title, valid.title, 'untouched fields survive');
    assert.notEqual(response.body.updatedAt, response.body.createdAt);
  });

  it('rejects an empty PATCH body', async () => {
    await request(app).patch(`/v1/bookmarks/${id}`).send({}).expect(422);
  });

  it('replaces the whole resource with PUT', async () => {
    const response = await request(app)
      .put(`/v1/bookmarks/${id}`)
      .send({ url: 'https://deno.com', title: 'Deno' })
      .expect(200);

    assert.equal(response.body.url, 'https://deno.com');
    assert.deepEqual(
      response.body.tags,
      [],
      'omitted fields are reset, not kept',
    );
    assert.equal(response.body.id, id, 'the id survives a replacement');
  });

  it('deletes with 204 and no body, then 404 on a second delete', async () => {
    const deleted = await request(app)
      .delete(`/v1/bookmarks/${id}`)
      .expect(204);
    assert.deepEqual(deleted.body, {});

    await request(app).delete(`/v1/bookmarks/${id}`).expect(404);
  });

  it('frees the URL for reuse once deleted', async () => {
    await request(app).delete(`/v1/bookmarks/${id}`).expect(204);
    await request(app).post('/v1/bookmarks').send(valid).expect(201);
  });
});

describe('unmatched routes', () => {
  it('returns the same problem envelope as every other failure', async () => {
    const response = await request(app)
      .get('/v1/does-not-exist')
      .expect(404)
      .expect('Content-Type', /application\/problem\+json/);

    assert.equal(response.body.code, 'not_found');
    assert.ok(response.body.requestId, 'every failure carries a request id');
    assert.equal(response.headers['cache-control'], 'no-store');
  });
});
