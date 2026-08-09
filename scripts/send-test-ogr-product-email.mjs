/**
 * Staging smoke for OGR product outreach email.
 * Canonical path is POST /api/staff/ogr-product-email (use --token + --product-id).
 * Fallback (--slug, no token): public RPC + Resend with a minimal composed body.
 *
 * Usage:
 *   npm run email:test-ogr-product -- --to=you@example.com --product-id=<uuid> --token=<jwt>
 *   npm run email:test-ogr-product -- --to=you@example.com --slug=american-revival
 *
 * Never hardcodes a recipient. Requires RESEND_API_KEY for the slug fallback path.
 */
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : '';
}

const to = argValue('to');
const productId = argValue('product-id');
const slug = argValue('slug');
const token = argValue('token');
const baseUrl = (argValue('base-url') || 'http://localhost:4321').replace(/\/$/, '');

if (!to || !to.includes('@')) {
  console.error('Required: --to=recipient@example.com (explicit test address; never hardcoded).');
  process.exit(1);
}

if (!productId && !slug) {
  console.error('Required: --product-id=<uuid> or --slug=<public-slug>.');
  process.exit(1);
}

async function sendViaStaffApi() {
  if (!productId) {
    console.error('Staff API path requires --product-id=<uuid> (plus --token).');
    process.exit(1);
  }
  if (!token) {
    console.error('Staff API path requires --token=<staff JWT>.');
    process.exit(1);
  }

  const res = await fetch(`${baseUrl}/api/staff/ogr-product-email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ productId, to }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    console.error('Staff API send failed:', res.status, body);
    process.exit(1);
  }
  console.log('Sent via staff API:', body);
}

async function sendViaSlugFallback() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 're_xxxxxxxxx') {
    console.error('Set RESEND_API_KEY in `.env` (replace re_xxxxxxxxx). Email is not configured.');
    process.exit(1);
  }

  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    console.error('Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, anonKey);
  const { data, error } = await supabase.rpc('get_public_ogr_product_by_slug', {
    p_slug: slug,
  });
  if (error) {
    console.error('Product fetch failed:', error.message);
    process.exit(1);
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    console.error('Published product not found for slug:', slug);
    process.exit(1);
  }

  const site =
    (process.env.PUBLIC_SITE_URL || 'https://justinfassio.com').replace(/\/$/, '') ||
    'https://justinfassio.com';
  const href = `${site}/old-guys-rule-wholesale/${encodeURIComponent(String(row.public_slug).trim().toLowerCase())}`;
  const name = String(row.name ?? 'Old Guys Rule');
  const tagline = String(row.tagline ?? '').trim();
  const subject = `Old Guys Rule — ${name}`;
  const html = `
<p>Hi,</p>
<p>I thought this Old Guys Rule style could be a strong fit for your store.</p>
<p><strong>${name}</strong>${tagline ? ` — ${tagline}` : ''}</p>
<p><a href="${href}">View Details</a></p>
<p>— Justin Fassio</p>
<p style="font-size:12px;color:#888">justinfassio.com</p>
`.trim();
  const text = [
    'Hi,',
    '',
    'I thought this Old Guys Rule style could be a strong fit for your store.',
    '',
    name + (tagline ? ` — ${tagline}` : ''),
    '',
    'View Details:',
    href,
    '',
    '— Justin Fassio',
    'justinfassio.com',
  ].join('\n');

  const from = process.env.WHOLESALE_ORDER_EMAIL_FROM || 'Justin Fassio <office@justinfassio.com>';
  const resend = new Resend(apiKey);
  const { data: sent, error: sendError } = await resend.emails.send({
    from,
    to,
    subject,
    html,
    text,
  });
  if (sendError) {
    console.error('Resend error:', sendError);
    process.exit(1);
  }
  console.log('Sent via slug fallback (not staff API):', sent);
  console.log('CTA href:', href);
}

if (token) {
  await sendViaStaffApi();
} else if (slug) {
  await sendViaSlugFallback();
} else {
  console.error(
    'Provide --token=<jwt> with --product-id=<uuid> for the staff API, or --slug=<public-slug> for the Resend fallback.',
  );
  process.exit(1);
}
