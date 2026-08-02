/**
 * One-shot Resend smoke test (server-side only).
 *
 * Usage:
 *   1. Set RESEND_API_KEY in `.env` (replace re_xxxxxxxxx with your real key)
 *   2. npm run email:test
 */
import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey || apiKey === 're_xxxxxxxxx') {
  console.error(
    'Set RESEND_API_KEY in `.env` to your real Resend API key (replace re_xxxxxxxxx).',
  );
  process.exit(1);
}

const resend = new Resend(apiKey);

const { data, error } = await resend.emails.send({
  from: 'onboarding@resend.dev',
  to: 'office@justinfassio.com',
  subject: 'Hello World',
  html: '<p>Congrats on sending your <strong>first email</strong>!</p>',
});

if (error) {
  console.error('Resend error:', error);
  process.exit(1);
}

console.log('Email sent:', data);
