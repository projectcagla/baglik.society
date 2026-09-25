import { getViewer } from '@/server/auth/viewer';
import { deskFilm } from '@/server/dal/desk';
import { brandLower, programLabel, SECTION_LABELS } from '@/lib/text';

// Optional git-friendly export of one film's editorial record. Daily
// publishing never depends on this; it is a portable copy.
export async function GET(_req: Request, ctx: RouteContext<'/masa/filmler/[id]/markdown'>) {
  const viewer = await getViewer();
  const { id } = await ctx.params;
  if (!viewer?.isStaff || !/^[0-9a-f-]{36}$/.test(id))
    return new Response('Not found', { status: 404 });
  const data = await deskFilm(viewer, id);
  if (!data) return new Response('Not found', { status: 404 });
  const { film, resources, questions, notes } = data;
  const lines: string[] = [
    '---',
    `program_no: ${film.program_no ?? ''}`,
    `slug: ${film.slug}`,
    `title: ${JSON.stringify(film.title)}`,
    `title_original: ${JSON.stringify(film.title_original ?? '')}`,
    `director: ${JSON.stringify(film.director ?? '')}`,
    `year: ${film.year ?? ''}`,
    `status: ${film.status}`,
    `curator: ${JSON.stringify(film.curator_credit ?? '')}`,
    '---',
    '',
    `# ${programLabel(film.program_no, film.title)}`,
    '',
  ];
  if (film.intro) lines.push(film.intro, '');
  for (const layer of ['once', 'sonra'] as const) {
    const list = resources.filter((r) => r.layer === layer);
    if (!list.length) continue;
    lines.push(`## ${layer === 'once' ? 'önce' : 'sonra'}`, '');
    for (const r of list) {
      lines.push(`### ${r.heading ?? r.title_original}`, '');
      lines.push(
        `- bölüm: ${SECTION_LABELS[r.section]} · tür: ${r.kind} · spoiler: ${r.spoiler_level} · durum: ${r.status}`,
      );
      if (r.title_original) lines.push(`- özgün başlık: ${r.title_original}`);
      const cite = [r.publication, r.author, r.form_label, r.published_year]
        .filter(Boolean)
        .join(' · ');
      if (cite) lines.push(`- künye: ${cite}`);
      if (r.url) lines.push(`- kaynak: <${r.url}>`);
      lines.push(`- hak: ${r.rights_status}${r.rights_note ? ` (${r.rights_note})` : ''}`, '');
      if (r.note) lines.push(r.note, '');
      if (r.prompt) lines.push(`> not: ${r.prompt}`, '');
    }
  }
  if (questions.length) {
    lines.push('## sorular', '');
    for (const q of questions) lines.push(`- (${q.layer}, ${q.status}) ${q.body}`);
    lines.push('');
  }
  for (const n of notes) lines.push(`## ${brandLower(n.title)} (${n.status})`, '', n.body, '');
  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${film.slug}.md"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
