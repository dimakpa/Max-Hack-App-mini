export interface DeliveryInput {
  maxUserId: string | null;
  text: string;
  deepLinkPayload: string | null;
}

export interface DeliveryConfig {
  token: string;
  publicAppUrl: string;
}

export type DeliveryResult = { mode: 'DRY_RUN' | 'MAX'; externalId?: string };

export async function deliver(input: DeliveryInput, config: DeliveryConfig): Promise<DeliveryResult> {
  if (!config.token || !input.maxUserId) return { mode: 'DRY_RUN' };
  const appUrl = input.deepLinkPayload
    ? `${config.publicAppUrl}${config.publicAppUrl.includes('?') ? '&' : '?'}context=${encodeURIComponent(input.deepLinkPayload)}`
    : config.publicAppUrl;
  const response = await fetch(`https://platform-api2.max.ru/messages?user_id=${encodeURIComponent(input.maxUserId)}`, {
    method: 'POST',
    headers: { Authorization: config.token, 'content-type': 'application/json' },
    body: JSON.stringify({
      text: input.text,
      attachments: [{
        type: 'inline_keyboard',
        payload: { buttons: [[{ type: 'link', text: 'Открыть ТехЗаказ', url: appUrl }]] }
      }]
    })
  });
  if (!response.ok) throw new Error(`MAX API returned ${response.status}`);
  const body = await response.json() as { message?: { body?: { mid?: string } }; body?: { mid?: string }; mid?: string };
  return { mode: 'MAX', externalId: body.message?.body?.mid ?? body.body?.mid ?? body.mid };
}

