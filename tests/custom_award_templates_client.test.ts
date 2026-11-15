import { describe, expect, it } from 'vitest';
import {
  customAwardTemplatesClient,
  parseCustomAwardTemplatesBody,
} from '../src/net/custom_award_templates_client';

describe('parseCustomAwardTemplatesBody', () => {
  it('accepts enabled lists and rejects disabled realms', () => {
    expect(parseCustomAwardTemplatesBody({ enabled: false, templates: [] })).toBeNull();
    expect(
      parseCustomAwardTemplatesBody({
        enabled: true,
        templates: [{ id: 1, title: 'A', description: '', createdAt: 2 }],
      }),
    ).toEqual([{ id: 1, title: 'A', description: '', createdAt: 2 }]);
  });
});

describe('customAwardTemplatesClient issue', () => {
  it('maps issue errors to outcomes', async () => {
    const fetchImpl: typeof fetch = async () =>
      ({
        ok: false,
        status: 409,
        json: async () => ({ ok: false, code: 'custom_award.not_found' }),
      }) as Response;
    const client = customAwardTemplatesClient(
      () => ({ base: '', token: 't', characterId: 1 }),
      fetchImpl,
    );
    expect(await client.issue(3, 'Ally')).toBe('not_found');
  });
});