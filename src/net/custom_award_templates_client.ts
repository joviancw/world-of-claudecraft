// The online half of IWorldDeeds.customAwardTemplates: saved award templates
// and issue over REST (server/custom_awards_routes.ts).

import { apiUrl } from '../client_origin';
import type {
  CustomAwardIssueOutcome,
  CustomAwardTemplateCreateOutcome,
  CustomAwardTemplatesSource,
  CustomAwardTemplateView,
} from '../world_api/deeds';
import type { CustomAwardsAuth } from './custom_awards_client';

function asTemplate(raw: unknown): CustomAwardTemplateView | null {
  const r = raw as Record<string, unknown> | null;
  if (
    !r ||
    typeof r.id !== 'number' ||
    typeof r.title !== 'string' ||
    typeof r.description !== 'string' ||
    typeof r.createdAt !== 'number'
  ) {
    return null;
  }
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    createdAt: r.createdAt,
  };
}

export function parseCustomAwardTemplatesBody(body: unknown): CustomAwardTemplateView[] | null {
  const b = body as { enabled?: unknown; templates?: unknown } | null;
  if (b?.enabled !== true) return null;
  const templates = b.templates;
  if (!Array.isArray(templates)) return null;
  const out: CustomAwardTemplateView[] = [];
  for (const raw of templates) {
    const view = asTemplate(raw);
    if (view) out.push(view);
  }
  return out;
}

function issueCode(body: Record<string, unknown>): CustomAwardIssueOutcome {
  if (body.ok === true) return 'ok';
  const code = body.code;
  if (code === 'custom_award.not_found') return 'not_found';
  if (code === 'custom_award.self') return 'self';
  if (code === 'custom_award.duplicate') return 'duplicate';
  if (code === 'custom_award.daily_cap') return 'capped';
  if (code === 'custom_award.busy') return 'busy';
  return 'failed';
}

function createCode(status: number, body: Record<string, unknown>): CustomAwardTemplateCreateOutcome {
  if (status === 200 && body.ok === true) return 'ok';
  if (status === 400) return 'invalid';
  const code = body.code;
  if (code === 'custom_award.template_duplicate') return 'duplicate';
  if (code === 'custom_award.template_cap') return 'capped';
  return 'failed';
}

export function customAwardTemplatesClient(
  auth: () => CustomAwardsAuth,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): CustomAwardTemplatesSource {
  const authHeaders = (a: CustomAwardsAuth, jsonBody?: unknown) => ({
    ...(jsonBody !== undefined
      ? { 'Content-Type': 'application/json' as const }
      : {}),
    Authorization: `Bearer ${a.token}`,
  });
  return {
    async list() {
      const a = auth();
      try {
        const res = await fetchImpl(
          apiUrl(
            `/api/custom-award-templates?character=${encodeURIComponent(a.characterId)}`,
            a.base,
          ),
          { headers: authHeaders(a) },
        );
        if (!res.ok) return null;
        return parseCustomAwardTemplatesBody(await res.json());
      } catch {
        return null;
      }
    },
    async create(title, description) {
      const a = auth();
      try {
        const res = await fetchImpl(apiUrl('/api/custom-award-templates', a.base), {
          method: 'POST',
          headers: authHeaders(a, { character: a.characterId, title, description }),
          body: JSON.stringify({ character: a.characterId, title, description }),
        });
        const body = (await res.json()) as Record<string, unknown>;
        return createCode(res.status, body);
      } catch {
        return 'failed';
      }
    },
    async delete(templateId) {
      const a = auth();
      try {
        const res = await fetchImpl(apiUrl('/api/custom-award-templates', a.base), {
          method: 'DELETE',
          headers: authHeaders(a, { character: a.characterId, template: templateId }),
          body: JSON.stringify({ character: a.characterId, template: templateId }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    async issue(templateId, recipientName) {
      const a = auth();
      try {
        const res = await fetchImpl(apiUrl('/api/custom-awards/issue', a.base), {
          method: 'POST',
          headers: authHeaders(a, {
            character: a.characterId,
            template: templateId,
            recipient: recipientName,
          }),
          body: JSON.stringify({
            character: a.characterId,
            template: templateId,
            recipient: recipientName,
          }),
        });
        if (res.status === 429) return 'busy';
        const body = (await res.json()) as Record<string, unknown>;
        return issueCode(body);
      } catch {
        return 'failed';
      }
    },
  };
}