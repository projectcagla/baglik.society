import 'server-only';
import { asSystem } from '@/server/db/system';
import { env } from '@/server/env';

export type DeliveryKind = 'kurtarma_kodu' | 'konum' | 'hatirlatma' | 'davet';

export interface MailInput {
  to: string | null;
  subject: string;
  text: string;
  kind: DeliveryKind;
  memberId: string | null;
  eventId?: string | null;
  actorId?: string | null;
}

export type DeliveryStatus = 'gonderildi' | 'hata' | 'saglayici_yok' | 'adres_yok';

export function mailConfigured(): boolean {
  const e = env();
  return !!(e.RESEND_API_KEY && e.MAIL_FROM);
}

/**
 * Sends plain-text mail through Resend when configured and records the true
 * outcome. Without a provider nothing is claimed as sent: the row says
 * `saglayici_yok` and the admin sees it in the delivery log.
 */
export async function deliver(input: MailInput): Promise<DeliveryStatus> {
  const e = env();
  let status: DeliveryStatus;
  let providerId: string | null = null;
  let error: string | null = null;

  if (!input.to) {
    status = 'adres_yok';
  } else if (!mailConfigured()) {
    status = 'saglayici_yok';
  } else {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${e.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: e.MAIL_FROM,
          to: [input.to],
          subject: input.subject,
          text: input.text,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        status = 'gonderildi';
        providerId = ((await res.json()) as { id?: string }).id ?? null;
      } else {
        status = 'hata';
        error = `HTTP ${res.status}`;
      }
    } catch (err) {
      status = 'hata';
      error = err instanceof Error ? err.name : 'error';
    }
  }

  await asSystem(
    (tx) => tx`
      insert into notification_deliveries
        (kind, member_id, event_id, channel, status, provider, provider_message_id, error, sent_at, created_by)
      values (${input.kind}, ${input.memberId}, ${input.eventId ?? null}, 'email', ${status},
              ${mailConfigured() ? 'resend' : null}, ${providerId}, ${error},
              ${status === 'gonderildi' ? new Date() : null}, ${input.actorId ?? null})`,
  );
  return status;
}
