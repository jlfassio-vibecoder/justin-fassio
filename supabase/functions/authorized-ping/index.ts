import { jsonResponse } from '../_shared/cors.ts';
import { handleCorsOptions, requireApprovedStaff } from '../_shared/requireApprovedStaff.ts';

Deno.serve(async (req) => {
  const options = handleCorsOptions(req);
  if (options) return options;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  const gate = await requireApprovedStaff(req);
  if (!gate.ok) return gate.response;

  return jsonResponse({ ok: true }, 200);
});
