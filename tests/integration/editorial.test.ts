import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asAnonymous, asMember } from '@/server/db/context';
import { asSystem } from '@/server/db/system';
import { closeDb } from '@/server/db/client';
import { getFilm, reportLink } from '@/server/dal/films';
import { addContribution } from '@/server/dal/journal';
import { film, makeMember, viewerFor } from '../support/fixtures';

afterAll(closeDb);

let member: ReturnType<typeof viewerFor>;
let editor: ReturnType<typeof viewerFor>;
let canavar: string;
let dmc: string;
const created: string[] = [];

async function resource(
  filmId: string,
  patch: { layer: 'once' | 'sonra'; status: 'taslak' | 'yayinda'; spoiler?: string },
) {
  const [r] = await asSystem(
    (tx) => tx<{ id: string }[]>`
      insert into resources (film_id, layer, section, kind, heading, url, spoiler_level, rights_status, status, published_at)
      values (${filmId}, ${patch.layer}, 'okuma', 'article', ${`test kaynak ${created.length}`},
              'https://example.org/x', ${patch.spoiler ?? 'yok'}, 'baglanti', ${patch.status},
              ${patch.status === 'yayinda' ? new Date() : null})
      returning id`,
  );
  created.push(r!.id);
  return r!.id;
}

beforeAll(async () => {
  member = viewerFor(await makeMember('member'), 'member');
  editor = viewerFor(await makeMember('editor'), 'editor');
  canavar = await film('002-canavar');
  dmc = await film('001-drive-my-car');
});

afterAll(async () => {
  await asSystem(async (tx) => {
    await tx`delete from audit_logs where target_id = any(${created})`;
    await tx`delete from resources where id = any(${created})`;
  });
});

describe('"üye gibi gör" uses member rights in the database', () => {
  it('drafts reach the desk view but not the preview', async () => {
    const draft = await resource(canavar, { layer: 'once', status: 'taslak' });
    const desk = await getFilm(editor, '002-canavar');
    const preview = await getFilm(editor, '002-canavar', { asMemberPreview: true });
    const plain = await getFilm(member, '002-canavar');
    expect(desk!.before.map((r) => r.id)).toContain(draft);
    expect(preview!.before.map((r) => r.id)).not.toContain(draft);
    // preview returns exactly what a member gets
    expect(preview!.before.map((r) => r.id)).toEqual(plain!.before.map((r) => r.id));
    expect(preview!.questions.map((q) => q.id)).toEqual(plain!.questions.map((q) => q.id));
  });

  it('the preview cannot write, even for an editor', async () => {
    const [row] = await asMember(
      { memberId: editor.id, mfa: false, preview: true },
      (tx) =>
        tx<{ n: number }[]>`
        with u as (update films set curator_credit = curator_credit where id = ${canavar} returning 1)
        select count(*)::int as n from u`,
    );
    expect(row!.n).toBe(0);
  });

  it('a member cannot switch the preview off to gain rights', async () => {
    // app.preview only ever narrows: a member asking for it is still a member
    const [row] = await asMember(
      { memberId: member.id, mfa: false, preview: true },
      (tx) => tx<{ role: string }[]>`select app.role() as role`,
    );
    expect(row!.role).toBe('member');
  });

  it('desk-only notes are stripped from member views', async () => {
    const plain = await getFilm(member, '001-drive-my-car');
    expect(plain!.before.every((r) => r.review_note === null)).toBe(true);
    const desk = await getFilm(editor, '001-drive-my-car');
    expect(desk!.before.some((r) => r.review_note)).toBe(true);
  });
});

describe('spoiler contract', () => {
  it('a spoiler source cannot be published in the pre-screening layer', async () => {
    const id = await resource(canavar, { layer: 'once', status: 'taslak', spoiler: 'var' });
    await expect(
      asMember(
        { memberId: editor.id, mfa: false },
        (tx) => tx`update resources set status = 'yayinda', published_at = now() where id = ${id}`,
      ),
    ).rejects.toThrow(/resources_no_spoiler_before/);
    // the same source is fine after the screening
    await asMember(
      { memberId: editor.id, mfa: false },
      (tx) =>
        tx`update resources set layer = 'sonra', status = 'yayinda', published_at = now() where id = ${id}`,
    );
  });

  it('the after layer of a coming film stays closed to members', async () => {
    const after = await resource(canavar, { layer: 'sonra', status: 'yayinda', spoiler: 'var' });
    const seen = await getFilm(member, '002-canavar');
    expect(seen!.after.map((r) => r.id)).not.toContain(after);
    expect(seen!.afterVisible).toBe(false);
    const [row] = await asMember(
      { memberId: member.id, mfa: false },
      (tx) => tx<{ n: number }[]>`select count(*)::int as n from resources where id = ${after}`,
    );
    expect(row!.n).toBe(0);
  });

  it('the after layer cannot be opened before the night — the start time is not a publish', async () => {
    await expect(
      asMember(
        { memberId: editor.id, mfa: false },
        (tx) => tx`update films set after_published_at = now() where id = ${canavar}`,
      ),
    ).rejects.toThrow(/after layer requires a screening/);
    // once the film is marked as screened, the editor may open it by hand
    const [f] = await asSystem(
      (tx) => tx<{ id: string }[]>`
        insert into films (slug, title, status, published_at) values ('test-izlendi', 'test', 'izlendi', now())
        returning id`,
    );
    await asMember(
      { memberId: editor.id, mfa: false },
      (tx) => tx`update films set after_published_at = now() where id = ${f!.id}`,
    );
    await asSystem((tx) => tx`delete from films where id = ${f!.id}`);
  });
});

describe('link reports', () => {
  it('a member can flag a visible link once a day', async () => {
    const id = await resource(dmc, { layer: 'once', status: 'yayinda' });
    await reportLink(member, id);
    await reportLink(member, id);
    const [row] = await asSystem(
      (tx) => tx<{ link_report_count: number; link_reported_at: Date | null }[]>`
        select link_report_count, link_reported_at from resources where id = ${id}`,
    );
    expect(row!.link_report_count).toBe(1);
    expect(row!.link_reported_at).toBeInstanceOf(Date);
  });

  it('drafts, closed layers and anonymous callers are refused', async () => {
    const draft = await resource(dmc, { layer: 'once', status: 'taslak' });
    const closed = await resource(canavar, { layer: 'sonra', status: 'yayinda' });
    await expect(reportLink(member, draft)).rejects.toThrow(/not found/);
    await expect(reportLink(member, closed)).rejects.toThrow(/not found/);
    await expect(asAnonymous((tx) => tx`select app.report_link(${draft})`)).rejects.toThrow(
      /not allowed/,
    );
  });
});

describe('discussion', () => {
  it('a contribution cannot be silently rewritten; it can be withdrawn', async () => {
    const [q] = await asSystem(
      (tx) =>
        tx<
          { id: string }[]
        >`select id from questions where film_id = ${dmc} and layer = 'sonra' limit 1`,
    );
    await addContribution(member, {
      filmId: dmc,
      questionId: q!.id,
      parentId: null,
      body: 'ilk hâli',
      attribution: 'anonim',
    });
    const [c] = await asSystem(
      (tx) =>
        tx<{ id: string }[]>`select id from contributions where member_id = ${member.id} limit 1`,
    );
    await expect(
      asMember(
        { memberId: member.id, mfa: false },
        (tx) => tx`update contributions set body = 'değiştirilmiş' where id = ${c!.id}`,
      ),
    ).rejects.toThrow(/permission denied/);
    await asMember(
      { memberId: member.id, mfa: false },
      (tx) => tx`update contributions set status = 'geri_cekildi' where id = ${c!.id}`,
    );
    const [after] = await asSystem(
      (tx) =>
        tx<
          { body: string; status: string }[]
        >`select body, status from contributions where id = ${c!.id}`,
    );
    expect(after).toMatchObject({ body: 'ilk hâli', status: 'geri_cekildi' });
    await asSystem((tx) => tx`delete from contributions where id = ${c!.id}`);
  });
});
