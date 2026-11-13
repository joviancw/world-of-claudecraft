// The online half of IWorldDeeds.customAwards: the private realm's
// player-awarded achievements over REST (server/custom_awards_routes.ts).
// Kept out of online.ts (the ClientWorld monolith) behind one field. Every
// read resolves null and every write false on any failure, the facet's
// documented no-data values; the server owns ownership and the realm gate.

import { apiUrl } from '../client_origin';
import type { CustomAwardsSource, CustomAwardView } from '../world_api/deeds';

export interface CustomAwardsAuth {
  base: string;
  token: string;
  characterId: number;
}

function asView(raw: unknown): CustomAwardView | null {
  const r = raw as Record<string, unknown> | null;
  if (
    !r ||
    typeof r.id !== 'number' ||
    typeof r.title !== 'string' ||
    typeof r.description !== 'string' ||
    typeof r.giverName !== 'string' ||
    typeof r.hidden !== 'boolean' ||
    typeof r.createdAt !== 'number'
  ) {
    return null;
  }
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    giverName: r.giverName,
    hidden: r.hidden,
    createdAt: r.createdAt,
  };
}

/** Parse the GET body; null when the realm is not private (`enabled: false`)
 *  or the body is not the documented shape. */
export function parseCustomAwardsBody(body: unknown): CustomAwardView[] | null {
  const b = body as { enabled?: unknown; awards?: unknown } | null;
  if (b?.enabled !== true) return null;
  const awards = b.awards;
  if (!Array.isArray(awards)) return null;
  const out: CustomAwardView[] = [];
  for (const raw of awards) {
    const view = asView(raw);
    if (view) out.push(view);
  }
  return out;
}

export function customAwardsClient(
  auth: () => CustomAwardsAuth,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): CustomAwardsSource {
  const post = async (path: string, body: Record<string, unknown>): Promise<boolean> => {
    const a = auth();
    try {
      const res = await fetchImpl(apiUrl(path, a.base), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` },
        body: JSON.stringify({ character: a.characterId, ...body }),
      });
      return res.ok;
    } catch {
      return false;
    }
  };
  return {
    async list() {
      const a = auth();
      try {
        const res = await fetchImpl(
          apiUrl(`/api/custom-awards?character=${encodeURIComponent(a.characterId)}`, a.base),
          { headers: { Authorization: `Bearer ${a.token}` } },
        );
        if (!res.ok) return null;
        return parseCustomAwardsBody(await res.json());
      } catch {
        return null;
      }
    },
    setHidden: (awardId, hidden) => post('/api/custom-awards/hide', { award: awardId, hidden }),
    reject: (awardId) => post('/api/custom-awards/reject', { award: awardId }),
  };
}
