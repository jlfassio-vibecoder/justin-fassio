import { supabase } from '@/lib/supabase';

export type AgentProductOutreachDraftDto = {
  id: string;
  messageType: string;
  origin: string;
  status: string;
  catalogItemId: string;
  resendEmailId: string | null;
  toEmail: string;
  toName: string;
  subject: string;
  introText: string;
  closingText: string;
  prospectId: number;
  accountContactId: string;
  sentBy: string | null;
  queuedAt: string | null;
  sentAt: string | null;
  payload: {
    sku: string;
    name: string;
    slug: string;
    productHref: string;
    from?: string;
  };
  createdAt: string;
  updatedAt: string;
};

type ApiFail = { ok: false; error: string };

async function staffFetch(
  path: string,
  init: RequestInit,
): Promise<{ res: Response; payload: Record<string, unknown> } | ApiFail> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return { ok: false, error: 'Not signed in' };
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    ...init,
    headers,
  });

  let payload: Record<string, unknown>;
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `Request failed (${res.status})` };
  }

  return { res, payload };
}

export type CreateAgentProductOutreachDraftInput = {
  productId: string;
  to: string;
  toName: string;
  prospectId: number;
  accountContactId: string;
  subject?: string;
  introText?: string;
  closingText?: string;
};

export async function createAgentProductOutreachDraft(
  input: CreateAgentProductOutreachDraftInput,
): Promise<{ ok: true; systemMessageId: string } | ApiFail> {
  const result = await staffFetch('/api/staff/ogr-product-email/drafts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if ('ok' in result && result.ok === false) return result;

  const { res, payload } = result as {
    res: Response;
    payload: Record<string, unknown>;
  };
  if (!res.ok || !payload.ok || typeof payload.systemMessageId !== 'string') {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `Create failed (${res.status})`,
    };
  }
  return { ok: true, systemMessageId: payload.systemMessageId };
}

export async function listAgentProductOutreachDraftsClient(input: {
  catalogItemId?: string;
  prospectId?: number;
  status?: string;
}): Promise<{ ok: true; drafts: AgentProductOutreachDraftDto[] } | ApiFail> {
  const params = new URLSearchParams();
  if (input.catalogItemId) params.set('catalogItemId', input.catalogItemId);
  if (input.prospectId != null) params.set('prospectId', String(input.prospectId));
  if (input.status) params.set('status', input.status);

  const result = await staffFetch(`/api/staff/ogr-product-email/drafts?${params}`, {
    method: 'GET',
  });
  if ('ok' in result && result.ok === false) return result;
  const { res, payload } = result as {
    res: Response;
    payload: Record<string, unknown>;
  };
  if (!res.ok || !payload.ok || !Array.isArray(payload.drafts)) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `List failed (${res.status})`,
    };
  }
  return { ok: true, drafts: payload.drafts as AgentProductOutreachDraftDto[] };
}

export async function updateAgentProductOutreachDraftClient(
  id: string,
  patch: {
    to?: string;
    toName?: string;
    subject?: string;
    introText?: string;
    closingText?: string;
  },
): Promise<{ ok: true; draft: AgentProductOutreachDraftDto } | ApiFail> {
  const result = await staffFetch(`/api/staff/ogr-product-email/drafts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  if ('ok' in result && result.ok === false) return result;
  const { res, payload } = result as {
    res: Response;
    payload: Record<string, unknown>;
  };
  if (!res.ok || !payload.ok || !payload.draft) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `Update failed (${res.status})`,
    };
  }
  return { ok: true, draft: payload.draft as AgentProductOutreachDraftDto };
}

export async function cancelAgentProductOutreachDraftClient(
  id: string,
): Promise<{ ok: true; draft: AgentProductOutreachDraftDto } | ApiFail> {
  const result = await staffFetch(`/api/staff/ogr-product-email/drafts/${id}/cancel`, {
    method: 'POST',
  });
  if ('ok' in result && result.ok === false) return result;
  const { res, payload } = result as {
    res: Response;
    payload: Record<string, unknown>;
  };
  if (!res.ok || !payload.ok || !payload.draft) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `Cancel failed (${res.status})`,
    };
  }
  return { ok: true, draft: payload.draft as AgentProductOutreachDraftDto };
}

export async function sendAgentProductOutreachDraft(
  id: string,
): Promise<
  { ok: true; systemMessageId: string; resendEmailId?: string; logged?: boolean } | ApiFail
> {
  const result = await staffFetch(`/api/staff/ogr-product-email/drafts/${id}/send`, {
    method: 'POST',
  });
  if ('ok' in result && result.ok === false) return result;
  const { res, payload } = result as {
    res: Response;
    payload: Record<string, unknown>;
  };
  if (!res.ok || !payload.ok || typeof payload.systemMessageId !== 'string') {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `Send failed (${res.status})`,
    };
  }
  return {
    ok: true,
    systemMessageId: payload.systemMessageId,
    ...(typeof payload.resendEmailId === 'string' ? { resendEmailId: payload.resendEmailId } : {}),
    ...(payload.logged === false ? { logged: false } : {}),
  };
}

export async function generateAgentProductOutreachDraft(input: {
  target: {
    preparationDate: string;
    prospectId: number;
    prospectName: string;
    accountContactId: string;
    toEmail: string;
    toName: string;
    primaryChannel: string | null;
    secondaryChannels: string[];
    catalogItemId: string;
    productSku: string;
    productName: string;
    productSlug: string;
    productIsNew: boolean;
    productSalesRank: number | null;
    selectionReasons: {
      priority: string | null;
      fitScore: number | null;
      channelMatch: boolean;
      productFit: 'channel_intersect' | 'global_fallback';
      exclusionsChecked: true;
    };
  };
  existingDraftId?: string;
}): Promise<
  | {
      ok: true;
      systemMessageId: string;
      subject: string;
      introText: string;
      closingText: string;
      fallback: string;
    }
  | ApiFail
> {
  const result = await staffFetch('/api/staff/ogr-product-email/generate-draft', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if ('ok' in result && result.ok === false) return result;
  const { res, payload } = result as {
    res: Response;
    payload: Record<string, unknown>;
  };
  if (!res.ok || !payload.ok || typeof payload.systemMessageId !== 'string') {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `Generate failed (${res.status})`,
    };
  }
  return {
    ok: true,
    systemMessageId: payload.systemMessageId,
    subject: typeof payload.subject === 'string' ? payload.subject : '',
    introText: typeof payload.introText === 'string' ? payload.introText : '',
    closingText: typeof payload.closingText === 'string' ? payload.closingText : '',
    fallback: typeof payload.fallback === 'string' ? payload.fallback : 'none',
  };
}
