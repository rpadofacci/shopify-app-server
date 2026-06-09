const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL, URLSearchParams } = require('url');

const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || '5cc371cf18fe48a4fdb91ba24dfa03c5';
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || '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';
const APP_URL = process.env.APP_URL || 'https://shopify-app-server-nw9r.onrender.com';
const REDIRECT_URI = `${APP_URL}/auth/callback`;
const SCOPES = 'read_products,read_orders';

function validateHmac(params) {
  const { hmac, ...rest } = params;
  const message = Object.keys(rest)
    .sort()
    .map(k => `${k}=${rest[k]}`)
    .join('&');
  const digest = crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(message)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(hmac, 'hex'));
  } catch {
    return false;
  }
}

function exchangeCodeForToken(shop, code) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code });
    const options = {
      hostname: shop,
      path: '/admin/oauth/access_token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.access_token) resolve(parsed);
          else reject(new Error(parsed.error_description || JSON.stringify(parsed)));
        } catch {
          reject(new Error('Respuesta inválida de Shopify'));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  const path = reqUrl.pathname;

  // Iniciar OAuth: redirigir a Shopify
  if (path === '/auth') {
    const shop = reqUrl.searchParams.get('shop');
    if (!shop || !shop.endsWith('.myshopify.com')) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Parámetro "shop" inválido o faltante (debe ser *.myshopify.com)');
    }
    const state = crypto.randomBytes(16).toString('hex');
    const authUrl =
      `https://${shop}/admin/oauth/authorize?` +
      new URLSearchParams({
        client_id: CLIENT_ID,
        scope: SCOPES,
        redirect_uri: REDIRECT_URI,
        state,
      }).toString();
    res.writeHead(302, { Location: authUrl });
    return res.end();
  }

  // Callback de OAuth: intercambiar code por access token
  if (path === '/auth/callback') {
    const params = Object.fromEntries(reqUrl.searchParams.entries());
    const { shop, code, hmac, state } = params;

    if (!shop || !code || !hmac) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Faltan parámetros requeridos (shop, code, hmac)');
    }

    if (!validateHmac(params)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('Validación HMAC fallida — posible request inválido');
    }

    try {
      const tokenData = await exchangeCodeForToken(shop, code);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>OAuth Shopify — Access Token</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f6f6f7; padding: 2rem; }
    .card { background: #fff; border-radius: 8px; padding: 2rem; max-width: 640px;
            margin: auto; box-shadow: 0 1px 4px rgba(0,0,0,.12); }
    h2 { color: #008060; margin-top: 0; }
    label { font-size: .8rem; color: #666; display: block; margin-top: 1rem; }
    pre { background: #f4f6f8; padding: 1rem; border-radius: 4px; font-size: .9rem;
          word-break: break-all; white-space: pre-wrap; border: 1px solid #dde; }
    .badge { display: inline-block; background: #e3f1eb; color: #008060;
             border-radius: 4px; padding: .2rem .5rem; font-size: .8rem; }
  </style>
</head>
<body>
  <div class="card">
    <h2>✓ OAuth Completado</h2>
    <label>Tienda</label>
    <pre>${shop}</pre>
    <label>Access Token</label>
    <pre>${tokenData.access_token}</pre>
    <label>Scopes concedidos</label>
    <pre>${tokenData.scope || '(no especificados)'}</pre>
    <p class="badge">Token listo para usar en Admin API</p>
  </div>
</body>
</html>`);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!DOCTYPE html>
<html><body style="font-family:monospace;padding:2rem">
  <h2 style="color:red">Error al obtener access token</h2>
  <pre>${err.message}</pre>
</body></html>`);
    }
  }

  // Health check
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', app: 'shopify-oauth-server' }));
});

server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Iniciar OAuth: ${APP_URL}/auth?shop=TU_TIENDA.myshopify.com`);
  console.log(`Callback registrado: ${REDIRECT_URI}`);
});
