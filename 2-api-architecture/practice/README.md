## Exercise — ETags, conditional GET, and a poisoned cache

> Add ETag-based conditional GET to a collection endpoint and prove the 304 path
> with `curl -v`. Then break `Vary` deliberately and watch a shared cache serve
> the wrong response to the wrong client.

### What it does

A small Express server with two endpoints, one working and one deliberately
broken.

**`GET /api/products`** returns a collection with an ETag. Send the ETag back in
`If-None-Match` and you get a `304 Not Modified` with no body.

**`GET /api/data-broken-vary`** returns JSON or plain text depending on the
`Accept` header — and does **not** send `Vary: Accept`. That single omission is
enough for a shared cache to store one response under a key that ignores
`Accept`, then hand it to a client that asked for the other format.

Proving the second one needs a real cache in front of the server, because curl
is not a cache. An nginx proxy cache is included for that.

### Running it

From the repository root:

```bash
npm run etag -w api-architecture-practice          # server on :3000
npm run etag:watch -w api-architecture-practice    # re-runs on save
npm run typecheck -w api-architecture-practice
```

For the cache demonstration, add the proxy in a second terminal:

```bash
cd 2-api-architecture/practice/httpexpress

docker run -d --name etag-cache -p 8080:80 \
  --add-host=host.docker.internal:host-gateway \
  -v "$PWD/nginx.conf:/etc/nginx/nginx.conf:ro" \
  nginx:alpine

docker rm -f etag-cache        # when finished
```

Give nginx a couple of seconds before the first request; it returns a connection
reset until the workers are up.

`docker-compose.yml` describes the same thing more readably, but the
`docker-compose` v1 binary on this machine cannot reach the daemon — a known
incompatibility between the old Python client and current urllib3. Installing
the Compose v2 plugin (`docker compose`, no hyphen) makes the file usable.

### Proving the 304

```bash
curl -i http://localhost:3000/api/products
# → 200, ETag: W/"54-oxrEcMlZFrDxXWjlsbN1SuyY+CA"

curl -i -H 'If-None-Match: W/"54-oxrEcMlZFrDxXWjlsbN1SuyY+CA"' \
     http://localhost:3000/api/products
# → 304 Not Modified, no body
```

### Proving the poisoned cache

Go through the proxy on `:8080`, not the server on `:3000`. Use a fresh query
string each run so you are not reading a stale entry.

```bash
U="http://localhost:8080/api/data-broken-vary?run=$RANDOM"

curl -i -H 'Accept: application/json' "$U"   # client A
curl -i -H 'Accept: text/plain'       "$U"   # client B
```

Observed:

```
CLIENT A  Accept: application/json   → Content-Type: application/json  X-Cache-Status: MISS
          {"format":"json","data":[…]}

CLIENT B  Accept: text/plain         → Content-Type: application/json  X-Cache-Status: HIT
          {"format":"json","data":[…]}        ← wrong response, wrong client
```

Client B asked for text and received JSON, served from cache.

### Layout

```
httpexpress/
├── server.ts             two endpoints: one correct, one deliberately broken
├── nginx.conf            proxy cache — the thing curl cannot be
└── docker-compose.yml    runs the cache on :8080
```

### What it demonstrates

**Express already does conditional GET.** `res.json()` generates the ETag and
Express compares `If-None-Match` itself, returning the 304 without the handler
being involved. Worth knowing before reaching for a library.

**A cache key does not include request headers.** nginx's default key is scheme
plus host plus request URI. A response that varies by `Accept` only gets stored
separately if it says so. `Vary` is how a response tells caches which request
headers changed the answer.

**`res.format()` sets `Vary: Accept` automatically.** Hand-rolling content
negotiation with `req.get('Accept')` and an `if` is exactly how the header goes
missing in real codebases — which makes this deliberate bug the realistic one.

**`no-cache` does not mean "do not cache".** It means "cache this, but
revalidate every time". `max-age=3600` plus an ETag means a browser will not
revalidate for an hour and never reaches the 304 path at all. curl always sends
the request, which is why a curl-only demo hides this.

**curl is not a cache.** Without a proxy in between you can only show that the
endpoint returns two different bodies, not that anything serves the wrong one.
The bug and the demonstration of the bug are different pieces of work.

### Finishing it

Add `res.set('Vary', 'Accept')` to the broken endpoint and run the two proxy
requests again with a fresh `?run=`. Expect `MISS` then `MISS`, with client B
finally receiving text — nginx now stores one entry per `Accept` value.

Worth trying as well: change `/api/products` to `Cache-Control: no-cache` and
watch a browser revalidate on every request instead of caching for an hour.
