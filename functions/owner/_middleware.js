// Password gate for Miguel's owner guide (/owner/). Password chosen by the agency.
const PASSWORD = 'website';
const COOKIE = 'owner_ok';

const page = (error) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Owner Guide | Cruz Construction</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111110;color:#f4f1ea;font:16px/1.5 system-ui,sans-serif}form{width:min(340px,90vw);display:grid;gap:12px;text-align:center}h1{font-size:22px;margin:0 0 4px}input{padding:14px;border-radius:8px;border:1px solid #444;background:#1c1c1a;color:#f4f1ea;font-size:16px}button{padding:14px;border:0;border-radius:8px;background:#f5b400;color:#111;font-weight:700;font-size:16px}p{margin:0;color:#e57373}</style></head>
<body><form method="post"><h1>Owner Guide</h1><input type="password" name="password" placeholder="Password" autofocus autocomplete="current-password" required>${error ? '<p>Wrong password, try again.</p>' : ''}<button type="submit">Open</button></form></body></html>`;

const html = (body, status = 200, extra = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', ...extra } });

export async function onRequest({ request, next }) {
  const cookie = request.headers.get('cookie') || '';
  if (cookie.split(/;\s*/).includes(`${COOKIE}=1`)) return next();

  if (request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    if (form && form.get('password') === PASSWORD) {
      return new Response(null, {
        status: 303,
        headers: { location: new URL(request.url).pathname, 'set-cookie': `${COOKIE}=1; Path=/owner; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax` },
      });
    }
    return html(page(true), 401);
  }
  return html(page(false), 401);
}
