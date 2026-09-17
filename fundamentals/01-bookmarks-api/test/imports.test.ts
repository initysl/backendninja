import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.ts';
import * as bookmarks from '../src/repositories/bookmark.repository.ts';
import * as reports from '../src/repositories/import-report.repository.ts';

const app = createApp();

const fixture = fileURLToPath(new URL('./fixtures/bookmarks.csv', import.meta.url));

beforeEach(() => {
  bookmarks.reset();
  reports.reset();
});

describe('POST /v1/imports/bookmarks', () => {
  it('imports the valid rows and reports the rest', async () => {
    const response = await request(app)
      .post('/v1/imports/bookmarks')
      .attach('file', fixture, { contentType: 'text/csv' })
      .expect(200);

    // The fixture holds six data rows: two good, one bad URL, one missing
    // title, one duplicate of an earlier row, one unparseable favorite.
    assert.equal(response.body.totalRows, 6);
    assert.equal(response.body.imported, 2);
    assert.equal(response.body.failed, 4);
    assert.ok(response.body.errorReportUrl, 'a report is offered when rows fail');

    // A bad row must never block a good one.
    const listed = await request(app).get('/v1/bookmarks').expect(200);
    assert.equal(listed.body.pagination.total, 2);
  });

  it('applies the same rules as the JSON endpoint', async () => {
    await request(app)
      .post('/v1/imports/bookmarks')
      .attach('file', fixture, { contentType: 'text/csv' })
      .expect(200);

    const listed = await request(app).get('/v1/bookmarks?q=nodejs.org').expect(200);
    const imported = listed.body.data[0];

    assert.deepEqual(imported.tags, ['node', 'javascript'], 'tags split on the semicolon');
    assert.equal(imported.favorite, true, 'the favorite column becomes a real boolean');
    assert.equal(typeof imported.description, 'string');
  });

  it('rejects a request with no file attached', async () => {
    const response = await request(app).post('/v1/imports/bookmarks').expect(400);
    assert.equal(response.body.code, 'bad_request');
  });

  it('reports nothing to download when every row is valid', async () => {
    const response = await request(app)
      .post('/v1/imports/bookmarks')
      .attach('file', Buffer.from('url,title\nhttps://deno.com,Deno\n'), {
        filename: 'clean.csv',
        contentType: 'text/csv',
      })
      .expect(200);

    assert.equal(response.body.failed, 0);
    assert.equal(response.body.errorReportUrl, null);
  });

  it('rejects a CSV whose header is missing the required columns', async () => {
    const response = await request(app)
      .post('/v1/imports/bookmarks')
      .attach('file', Buffer.from('name,link\nDeno,https://deno.com\n'), {
        filename: 'wrong-header.csv',
        contentType: 'text/csv',
      })
      .expect(422);

    assert.equal(response.body.code, 'unprocessable');
  });

  it('rejects a structurally broken CSV as the caller’s fault, not a 500', async () => {
    const response = await request(app)
      .post('/v1/imports/bookmarks')
      .attach('file', Buffer.from('url,title\nhttps://deno.com,Deno,extra-column\n'), {
        filename: 'ragged.csv',
        contentType: 'text/csv',
      })
      .expect(422);

    assert.equal(response.body.code, 'invalid_csv');
  });
});

describe('GET /v1/imports/:id/errors.csv', () => {
  it('streams the report as a downloadable attachment', async () => {
    const summary = await request(app)
      .post('/v1/imports/bookmarks')
      .attach('file', fixture, { contentType: 'text/csv' })
      .expect(200);

    const response = await request(app)
      .get(summary.body.errorReportUrl)
      .expect(200)
      .expect('Content-Type', /text\/csv/);

    assert.match(response.headers['content-disposition'], /^attachment; filename="/);

    const lines = response.text.trim().split('\n');
    assert.equal(lines[0], 'line,url,title,field,code,message');

    // Source line numbers, not record indices — the user opens this file in a
    // spreadsheet and goes to that line. The fixture's first bad row is line 4.
    const reportedLines = lines.slice(1).map((line) => Number(line.split(',')[0]));
    assert.deepEqual([...new Set(reportedLines)], [4, 5, 6, 7]);

    assert.ok(response.text.includes('duplicate_url'));
  });

  it('returns 404 for an unknown report id', async () => {
    await request(app)
      .get('/v1/imports/3fa85f64-5717-4562-b3fc-2c963f66afa6/errors.csv')
      .expect(404);
  });
});
