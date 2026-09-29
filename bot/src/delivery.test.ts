import { afterEach, describe, expect, it, vi } from 'vitest';
import { deliver } from './delivery.js';

afterEach(() => vi.unstubAllGlobals());

describe('notification delivery adapter', () => {
  it('uses deterministic dry-run when token is absent', async () => {
    await expect(deliver(
      { maxUserId: null, text: 'Тест', deepLinkPayload: 'order_public-id' },
      { token: '', publicAppUrl: 'http://localhost:8080' }
    )).resolves.toEqual({ mode: 'DRY_RUN' });
  });

  it('sends a MAX contact card after the other side confirms the exchange', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ mid: 'message-id' })
    });
    vi.stubGlobal('fetch', fetchMock);

    await deliver(
      { maxUserId: '100', text: 'Контакт подтверждён', deepLinkPayload: 'contact:200' },
      { token: 'token', publicAppUrl: 'https://example.test' }
    );

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({
      attachments: [
        { type: 'contact', payload: { contact_id: '200' } },
        { type: 'inline_keyboard' }
      ]
    });
  });
});
