import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatDay, formatTime, formatWeekday } from '@/lib/dates';
import { brandLower } from '@/lib/text';
import type { EventView } from '@/server/dal/events';

// Invitation exports, rebuilt from data in the rhythm of the approved
// "film gecesi 002" reference: large portal, sparse lowercase serif, short
// violet rules, "yalnızca davetlilere". The location is NEVER printed — the
// poster carries the public note only, whatever the release state.

export const FORMATS = {
  hikaye: { width: 1080, height: 1920, label: 'hikâye 9:16' },
  gonderi: { width: 1080, height: 1350, label: 'gönderi 4:5' },
  kart: { width: 1080, height: 1080, label: 'metin kartı' },
} as const;

export type PosterFormat = keyof typeof FORMATS;

const assets = join(process.cwd(), 'src', 'assets');

let cache: Promise<{
  fonts: { name: string; data: ArrayBuffer; weight: 400 | 500; style: 'normal' | 'italic' }[];
  portal: string;
  wordmark: string;
}> | null = null;

async function buf(path: string): Promise<ArrayBuffer> {
  const b = await readFile(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

export function loadPosterAssets() {
  cache ??= (async () => {
    const f = (sub: string, w: string, s: string) =>
      join(assets, 'fonts', `cormorant-garamond-${sub}-${w}-${s}.woff`);
    const fonts = [];
    for (const sub of ['latin', 'latin-ext']) {
      fonts.push({
        name: 'Cormorant',
        data: await buf(f(sub, '400', 'normal')),
        weight: 400 as const,
        style: 'normal' as const,
      });
      fonts.push({
        name: 'Cormorant',
        data: await buf(f(sub, '500', 'normal')),
        weight: 500 as const,
        style: 'normal' as const,
      });
      fonts.push({
        name: 'Cormorant',
        data: await buf(f(sub, '400', 'italic')),
        weight: 400 as const,
        style: 'italic' as const,
      });
    }
    const portal = `data:image/png;base64,${(await readFile(join(assets, 'brand', 'portal-hd.png'))).toString('base64')}`;
    const wordmark = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public', 'brand', 'wordmark.png'))).toString('base64')}`;
    return { fonts, portal, wordmark };
  })();
  return cache;
}

const INK = '#EFE9F3';
const SOFT = '#CFC3DA';
const VIOLET = '#9C7BC4';
const RULE = '#5E3F7A';

function Rule({ w = 96, m = 34 }: { w?: number; m?: number }) {
  return <div style={{ width: w, height: 2, background: RULE, margin: `${m}px 0` }} />;
}

export function Poster({
  view,
  format,
  portal,
  wordmark,
}: {
  view: EventView;
  format: PosterFormat;
  portal: string;
  wordmark: string;
}) {
  const { event, films } = view;
  const film = films[0];
  const { width, height } = FORMATS[format];
  const s = width / 1080; // scale
  const night = event.title
    ? brandLower(event.title)
    : event.number
      ? `${event.number}. film gecesi`
      : 'film gecesi';
  const title = film ? brandLower(film.title) : night;
  const director = film?.director ? brandLower(film.director) : null;
  // per-format rhythm: k scales type, m the rules' breathing room
  const k = format === 'hikaye' ? 1 : format === 'gonderi' ? 0.84 : 0.9;
  const m = format === 'hikaye' ? 34 : 20;
  const titleSize = Math.round(
    Math.min(168, Math.floor((width * 0.8) / Math.max(4, title.length * 0.5))) * k,
  );
  const portalH = format === 'hikaye' ? 900 : format === 'gonderi' ? 430 : 0;
  const fs = (n: number) => Math.round(n * k);
  const note = event.status === 'iptal' ? 'bu gece iptal edildi' : event.location_public_note;

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: format === 'kart' ? 'center' : 'flex-start',
        background: '#08080A',
        backgroundImage:
          'radial-gradient(ellipse 60% 40% at 50% 26%, rgba(86,50,109,0.28), rgba(8,8,10,0) 70%)',
        fontFamily: 'Cormorant',
        color: INK,
        paddingTop: format === 'kart' ? 0 : format === 'gonderi' ? 30 * s : 60 * s,
      }}
    >
      {portalH > 0 && (
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        <img
          src={portal}
          width={Math.round(portalH * (680 / 960))}
          height={portalH}
          style={{ marginBottom: -10 }}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img
        src={wordmark}
        width={format === 'kart' ? 440 : 520}
        height={Math.round((format === 'kart' ? 440 : 520) * (112 / 484))}
      />
      <Rule m={m} />
      <div style={{ display: 'flex', fontSize: fs(46), letterSpacing: 4, color: SOFT }}>
        {night}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: titleSize,
          fontWeight: 500,
          lineHeight: 1,
          marginTop: 6,
          letterSpacing: 3,
        }}
      >
        {title}
      </div>
      {director && (
        <div
          style={{
            display: 'flex',
            fontSize: fs(40),
            letterSpacing: 6,
            color: SOFT,
            marginTop: 12,
          }}
        >
          {director}
        </div>
      )}
      <Rule m={m} />
      <div style={{ display: 'flex', fontSize: fs(50), letterSpacing: 5 }}>
        {`${formatDay(event.starts_at)}, ${formatWeekday(event.starts_at)}`}
      </div>
      <div style={{ display: 'flex', fontSize: fs(50), letterSpacing: 5, marginTop: 4 }}>
        {formatTime(event.starts_at)}
      </div>
      <Rule m={m} />
      <div
        style={{
          fontSize: fs(38),
          letterSpacing: 3,
          color: SOFT,
          textAlign: 'center',
          maxWidth: 680,
          lineHeight: 1.35,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        {note}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: fs(34),
          fontStyle: 'italic',
          letterSpacing: 7,
          color: VIOLET,
          marginTop: format === 'hikaye' ? 48 : 22,
        }}
      >
        yalnızca davetlilere
      </div>
    </div>
  );
}
