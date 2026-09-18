import { describe, expect, it } from 'vitest';
import { deliver } from './delivery.js';

describe('notification delivery adapter', () => {
  it('uses deterministic dry-run when token is absent', async () => {
    await expect(deliver(
      { maxUserId: null, text: 'Тест', deepLinkPayload: 'order_public-id' },
      { token: '', publicAppUrl: 'http://localhost:8080' }
    )).resolves.toEqual({ mode: 'DRY_RUN' });
  });
});

