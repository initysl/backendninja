import express from 'express';

const app = express();
app.set('etag', 'weak'); // Enable weak ETags

const products = [
  { id: 1, name: 'Pro Keyboard', price: 150 },
  { id: 2, name: 'Ergo Mouse', price: 80 },
];

// Endpoint 1: ETag Conditional GET
app.get('/api/products', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(products);
});

// Endpoint 2: Deliberately Broken Vary (Vary header omitted for Accept)
app.get('/api/data-broken-vary', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  // BUG: Returns JSON or Text based on Accept, but fails to set "Vary: Accept"
  const accept = req.get('Accept');
  if (accept?.includes('application/json')) {
    res.json({ format: 'json', data: products });
  } else {
    res.send('Format: Text representation of products');
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
