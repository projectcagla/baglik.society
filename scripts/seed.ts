// Seeds the two real films, their editorial source records and film night 002.
// Safe to re-run: existing films/events are left untouched (admins own them
// after the first run). Creates no members — use `npm run owner:create`.
import { events, films } from '../db/seed/content';
import { scriptSql } from './lib/db';

export async function seed(url?: string, log = console.log) {
  const sql = scriptSql(url);
  try {
    await sql.begin(async (tx) => {
      for (const f of films) {
        const existing = await tx`select id from films where slug = ${f.slug}`;
        if (existing.length) {
          log(`film ${f.slug} exists — skipped`);
          continue;
        }
        const [film] = await tx<{ id: string }[]>`
          insert into films (program_no, slug, title, title_original, year, director, status,
                             sort_key, curator_credit, reading_label, published_at, after_published_at)
          values (${f.program_no}, ${f.slug}, ${f.title}, ${f.title_original}, ${f.year}, ${f.director},
                  ${f.status}, ${f.program_no}, ${f.curator_credit}, ${f.reading_label}, now(),
                  ${f.after_published ? sql`now()` : null})
          returning id`;
        let position = 0;
        for (const r of f.resources) {
          position += 1;
          await tx`
            insert into resources (film_id, layer, section, position, kind, heading, title_original, author,
              publication, form_label, language, published_year, duration_note, url, link_label, link_hint,
              access_note, spoiler_level, note, prompt, rights_status, status, published_at)
            values (${film!.id}, ${r.layer}, ${r.section}, ${position}, ${r.kind}, ${r.heading ?? null},
              ${r.title_original ?? null}, ${r.author ?? null}, ${r.publication ?? null}, ${r.form_label ?? null},
              ${r.language ?? null}, ${r.published_year ?? null}, ${r.duration_note ?? null}, ${r.url},
              ${r.link_label ?? null}, ${r.link_hint ?? null}, ${r.access_note ?? null}, ${r.spoiler_level},
              ${r.note ?? null}, ${r.prompt ?? null}, ${r.rights_status}, 'yayinda', now())`;
        }
        let qpos = 0;
        for (const q of f.questions) {
          qpos += 1;
          await tx`insert into questions (film_id, layer, body, position, status)
                   values (${film!.id}, ${q.layer}, ${q.body}, ${qpos}, 'yayinda')`;
        }
        log(`film ${f.slug}: ${f.resources.length} sources, ${f.questions.length} questions`);
      }
      for (const e of events) {
        const existing = await tx`select id from events where number = ${e.number}`;
        if (existing.length) {
          log(`event ${e.number} exists — skipped`);
          continue;
        }
        const [ev] = await tx<{ id: string }[]>`
          insert into events (number, starts_at, status, location_public_note)
          values (${e.number}, ${e.starts_at}, ${e.status}, ${e.location_public_note})
          returning id`;
        await tx`insert into event_films (event_id, film_id, position)
                 select ${ev!.id}, id, 0 from films where slug = ${e.film_slug}`;
        // location stays empty until an admin enters it
        await tx`insert into event_private (event_id) values (${ev!.id})`;
        log(`event ${e.number} (${e.starts_at}) — location not set`);
      }
    });
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seed().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
