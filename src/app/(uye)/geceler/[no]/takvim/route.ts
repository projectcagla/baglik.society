import { buildIcs } from '@/lib/ics';
import { brandLower } from '@/lib/text';
import { getViewer } from '@/server/auth/viewer';
import { getEventByNumber } from '@/server/dal/events';
import { env } from '@/server/env';

// Personal calendar file. Built from the same database answer as the page:
// before release there is simply no location to put in it.
export async function GET(_req: Request, ctx: RouteContext<'/geceler/[no]/takvim'>) {
  const viewer = await getViewer();
  if (!viewer)
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const no = Number((await ctx.params).no);
  const view = Number.isInteger(no) ? await getEventByNumber(viewer, no) : null;
  if (!view || !view.invite || view.invite.status !== 'davetli') {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const { event, films, location } = view;
  const film = films[0];
  const origin = env().APP_ORIGIN ?? '';
  const night = event.number ? `${event.number}. film gecesi` : 'film gecesi';
  const place =
    location.state === 'acik'
      ? [location.location_text, location.location_directions].filter(Boolean).join(' — ')
      : null;
  const description = [
    film
      ? `${brandLower(film.title)}${film.director ? ` — ${brandLower(film.director)}` : ''}`
      : null,
    place ? null : event.location_public_note,
    'konum paylaşıldığında bu dosyayı yeniden indirmen gerekir; takvim uygulaması eski kopyayı kendiliğinden güncellemez.',
  ]
    .filter(Boolean)
    .join('\n');

  const body = buildIcs({
    uid: `event-${event.id}@baglik.society`,
    sequence: event.ics_sequence + (place ? 1 : 0),
    start: event.starts_at,
    end: event.ends_at,
    summary: `bağlık.society · ${night}`,
    description,
    location: place,
    url: origin && event.number ? `${origin}/geceler/${event.number}` : null,
    cancelled: event.status === 'iptal',
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="baglik-gece-${event.number ?? 'x'}.ics"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
