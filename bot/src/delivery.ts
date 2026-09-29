export interface DeliveryInput {
  maxUserId: string | null;
  text: string;
  deepLinkPayload: string | null;
}

export interface DeliveryConfig {
  token: string;
}

export type DeliveryResult = { mode: 'DRY_RUN' | 'MAX'; externalId?: string };

function contactIdFromPayload(payload: string | null): string | null {
  const match = payload?.match(/^contact:(\d+)$/);
  return match?.[1] ?? null;
}

export async function deliver(input: DeliveryInput, config: DeliveryConfig): Promise<DeliveryResult> {
  if (!config.token || !input.maxUserId) return { mode: 'DRY_RUN' };
  const contactId = contactIdFromPayload(input.deepLinkPayload);
  const attachments: Array<Record<string, unknown>> = [];
  if (contactId) attachments.push({ type: 'contact', payload: { contact_id: contactId } });
  const response = await fetch(`https://platform-api2.max.ru/messages?user_id=${encodeURIComponent(input.maxUserId)}`, {
    method: 'POST',
    headers: { Authorization: config.token, 'content-type': 'application/json' },
    body: JSON.stringify({
      text: input.text,
      attachments
    })
  });
  if (!response.ok) throw new Error(`MAX API returned ${response.status}`);
  const body = await response.json() as { message?: { body?: { mid?: string } }; body?: { mid?: string }; mid?: string };
  return { mode: 'MAX', externalId: body.message?.body?.mid ?? body.body?.mid ?? body.mid };
}
