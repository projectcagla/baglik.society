import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asAnonymous, asMember } from '@/server/db/context';
import { asSystem } from '@/server/db/system';
import { closeDb } from '@/server/db/client';
import { getFilm, reportLink } from '@/server/dal/films';
import {
  approveResource,
  createResource,
  deskQueue,
  moderateContribution,
  moderateJournal,
  setResourceStatus,
  updateResource,
  type ResourceInput,
} from '@/server/dal/desk';
import {
  addContribution,
  createEntry,
  listContributions,
  listHiddenShared,
  listOwnEntries,
  shareEntry,
} from '@/server/dal/journal';
import { film, makeMember, viewerFor } from '../support/fixtures';

afterAll(closeDb);

let member: ReturnType<typeof viewerFor>;
let editor: ReturnType<typeof viewerFor>;
let canavar: string;
let dmc: string;
const created: string[] = [];

async function resource(
  filmId: string,
  patch: {
    layer: 'once' | 'sonra';
    status: 'taslak' | 'yayinda';
    spoiler?: string;
    approved?: boolean;
  },
) {
  // a published external source carries a person's approval (0004): the
  // fixture signs as the test editor, the way the desk would
  const approve = patch.approved ?? patch.status === 'yayinda';
  const [r] = await asSystem(async (tx) => {
    if (approve) await tx`select set_config('app.member_id', ${editor.id}, true)`;
    return tx<{ id: string }[]>`
      insert into resources (film_id, layer, section, kind, heading, url, spoiler_level, rights_status,
                             status, published_at, approved_at)
      values (${filmId}, ${patch.layer}, 'okuma', 'article', ${`test kaynak ${created.length}`},
              'https://example.org/x', ${patch.spoiler ?? 'yok'}, 'baglanti', ${patch.status},
              ${patch.status === 'yayinda' ? new Date() : null}, ${approve ? new Date() : null})
      returning id`;
  });
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
    const id = await resource(canavar, {
      layer: 'once',
      status: 'taslak',
      spoiler: 'var',
      approved: true,
    });
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

describe('after-layer moderation and withdrawals', () => {
  it('withdrawn text never leaves the server; removal is reversible and audited', async () => {
    const admin = viewerFor(await makeMember('admin'), 'admin', true);
    const adminNoMfa = { ...admin, mfaFresh: false };
    const [q] = await asSystem(
      (tx) =>
        tx<
          { id: string }[]
        >`select id from questions where film_id = ${dmc} and layer = 'sonra' limit 1`,
    );
    const author = viewerFor(await makeMember('member'), 'member');
    for (const body of ['GERI-CEKILEN', 'KALDIRILAN']) {
      await addContribution(author, {
        filmId: dmc,
        questionId: q!.id,
        parentId: null,
        body,
        attribution: 'isimli',
      });
    }
    const rows = await asSystem(
      (tx) =>
        tx<
          { id: string; body: string }[]
        >`select id, body from contributions where member_id = ${author.id}`,
    );
    const withdrawn = rows.find((r) => r.body === 'GERI-CEKILEN')!.id;
    const removed = rows.find((r) => r.body === 'KALDIRILAN')!.id;
    await asMember(
      { memberId: author.id, mfa: false },
      (tx) => tx`update contributions set status = 'geri_cekildi' where id = ${withdrawn}`,
    );
    await expect(moderateContribution(adminNoMfa, removed, 'kaldirildi')).rejects.toThrow(
      /not allowed/,
    );
    await moderateContribution(admin, removed, 'kaldirildi');

    // the author, another member and the moderator: nobody gets the withdrawn text
    for (const v of [author, member, admin]) {
      const seen = JSON.stringify(await listContributions(v, dmc));
      expect(seen, v.role).not.toContain('GERI-CEKILEN');
    }
    // the removed one reaches only the moderator (to be able to restore it)
    expect(JSON.stringify(await listContributions(member, dmc))).not.toContain('KALDIRILAN');
    expect(JSON.stringify(await listContributions(adminNoMfa, dmc))).not.toContain('KALDIRILAN');
    expect(JSON.stringify(await listContributions(admin, dmc))).toContain('KALDIRILAN');

    await moderateContribution(admin, removed, 'yayinda');
    expect(JSON.stringify(await listContributions(member, dmc))).toContain('KALDIRILAN');
    const log = await asSystem(
      (tx) => tx<{ state: string }[]>`
        select meta->>'state' as state from audit_logs
         where action = 'contribution.moderate' and target_id = ${removed} order by id`,
    );
    expect(log.map((l) => l.state)).toEqual(['kaldirildi', 'yayinda']);
    await asSystem((tx) => tx`delete from contributions where member_id = ${author.id}`);
  });

  it('a hidden shared note can be restored; private notes stay out of reach', async () => {
    const admin = viewerFor(await makeMember('admin'), 'admin', true);
    const author = viewerFor(await makeMember('member'), 'member');
    await createEntry(author, { filmId: null, kind: 'serbest', body: 'PAYLASILAN-NOT' });
    await createEntry(author, { filmId: null, kind: 'serbest', body: 'OZEL-NOT' });
    const entries = await listOwnEntries(author);
    const shared = entries.find((e) => e.body === 'PAYLASILAN-NOT')!;
    await shareEntry(author, shared.id, 'isimli');
    await moderateJournal(admin, shared.id, 'gizlendi');

    expect(await listHiddenShared(editor)).toEqual([]);
    expect(await listHiddenShared({ ...admin, mfaFresh: false })).toEqual([]);
    const hidden = JSON.stringify(await listHiddenShared(admin));
    expect(hidden).toContain('PAYLASILAN-NOT');
    expect(hidden).not.toContain('OZEL-NOT');

    await moderateJournal(admin, shared.id, 'gorunur');
    expect(JSON.stringify(await listHiddenShared(admin))).not.toContain('PAYLASILAN-NOT');
    await asSystem((tx) => tx`delete from journal_entries where member_id = ${author.id}`);
  });
});

describe('desk: checklist, approval, queue', () => {
  const input = (patch: Partial<ResourceInput> = {}) =>
    ({
      layer: 'once',
      section: 'okuma',
      position: 0,
      kind: 'article',
      heading: 'masa testi',
      title_original: 'Desk Test',
      url: 'https://example.org/desk',
      spoiler_level: 'belirtilmedi',
      rights_status: 'baglanti',
      ...patch,
    }) as ResourceInput;

  it('the server refuses a publish the checklist would refuse, item by item', async () => {
    const id = await createResource(editor, canavar, input());
    created.push(id);
    await expect(setResourceStatus(editor, id, true)).rejects.toThrow(/publish checklist/);
    await updateResource(editor, id, input({ spoiler_level: 'yok' }));
    // still missing: "neden bu kaynak" and a person's approval
    await expect(setResourceStatus(editor, id, true)).rejects.toThrow(/publish checklist/);
    await updateResource(editor, id, input({ spoiler_level: 'yok', rationale: 'neden: test.' }));
    // only the person's check is missing now, and the error says exactly that
    await expect(setResourceStatus(editor, id, true)).rejects.toThrow(
      /publication requires human approval/,
    );
    await approveResource(editor, id);
    await setResourceStatus(editor, id, true);
    const [row] = await asSystem(
      (tx) => tx<{ status: string }[]>`select status from resources where id = ${id}`,
    );
    expect(row!.status).toBe('yayinda');
  });

  it('the database itself refuses an unapproved publish and an approval without a person', async () => {
    const id = await createResource(
      editor,
      canavar,
      input({ spoiler_level: 'yok', rationale: 'neden: test.' }),
    );
    created.push(id);
    // straight SQL as the editor, skipping the desk's checklist
    await expect(
      asMember(
        { memberId: editor.id, mfa: false },
        (tx) => tx`update resources set status = 'yayinda', published_at = now() where id = ${id}`,
      ),
    ).rejects.toThrow(/publication requires human approval/);
    // a script, seed or link checker has no person in context
    await expect(
      asSystem((tx) => tx`update resources set approved_at = now() where id = ${id}`),
    ).rejects.toThrow(/approval requires a person/);
    await expect(
      asSystem(
        (tx) => tx`
          insert into resources (film_id, layer, section, kind, heading, url, spoiler_level, rights_status, status, published_at)
          values (${canavar}, 'once', 'okuma', 'article', 'seed gibi', 'https://example.org/s', 'yok', 'baglanti', 'yayinda', now())`,
      ),
    ).rejects.toThrow(/publication requires human approval/);
    // approval is recorded as the signed-in person, whatever the caller claims
    await asMember(
      { memberId: editor.id, mfa: false },
      (tx) =>
        tx`update resources set approved_at = now(), approved_by = ${member.id} where id = ${id}`,
    );
    const [row] = await asSystem(
      (tx) => tx<{ approved_by: string }[]>`select approved_by from resources where id = ${id}`,
    );
    expect(row!.approved_by).toBe(editor.id);
  });

  it('a published source whose link changes goes back to draft; an edit cannot break a published one', async () => {
    const id = await createResource(
      editor,
      canavar,
      input({ spoiler_level: 'yok', rationale: 'neden: test.' }),
    );
    created.push(id);
    await approveResource(editor, id);
    await setResourceStatus(editor, id, true);
    expect((await getFilm(member, '002-canavar'))!.before.map((r) => r.id)).toContain(id);

    // removing the rationale of a published source is refused (checklist on edit)
    await expect(
      updateResource(editor, id, input({ spoiler_level: 'yok', rationale: null })),
    ).rejects.toThrow(/publish checklist/);
    // a note fix keeps it published and approved
    const kept = await updateResource(
      editor,
      id,
      input({ spoiler_level: 'yok', rationale: 'neden: test.', note: 'yazım düzeltmesi' }),
    );
    expect(kept).toEqual({ approvalWithdrawn: false, returnedToDraft: false });
    // a new URL: approval withdrawn, back to draft, gone for members
    const moved = await updateResource(
      editor,
      id,
      input({ spoiler_level: 'yok', rationale: 'neden: test.', url: 'https://example.org/baska' }),
    );
    expect(moved).toEqual({ approvalWithdrawn: true, returnedToDraft: true });
    expect((await getFilm(member, '002-canavar'))!.before.map((r) => r.id)).not.toContain(id);
  });

  it('a link edit racing a publish can never leave an unapproved source published', async () => {
    const id = await createResource(
      editor,
      canavar,
      input({ spoiler_level: 'yok', rationale: 'neden: test.' }),
    );
    created.push(id);
    await approveResource(editor, id);
    const editorTx = async () => {
      const c = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
      await c`begin`;
      await c.unsafe('set local role baglik_app');
      await c`select set_config('app.member_id', ${editor.id}, true), set_config('app.mfa', 'off', true)`;
      return c;
    };
    const edit = await editorTx();
    const publish = await editorTx();
    try {
      // the edit holds the row with a new link (approval withdrawn, not yet committed)
      await edit`update resources set url = 'https://example.org/yaris' where id = ${id}`;
      // the publish checked an approved row a moment ago and now tries to flip it
      const racing =
        publish`update resources set status = 'yayinda', published_at = now() where id = ${id}`.then(
          () => 'published',
          (e: Error) => e.message,
        );
      await new Promise((r) => setTimeout(r, 300));
      await edit`commit`;
      expect(await racing).toMatch(/publication requires human approval/);
      await publish`rollback`;
    } finally {
      await edit.end();
      await publish.end();
    }
    const [row] = await asSystem(
      (tx) =>
        tx<
          { status: string; approved_at: Date | null }[]
        >`select status, approved_at from resources where id = ${id}`,
    );
    expect(row).toMatchObject({ status: 'taslak', approved_at: null });
  });

  it('approval is by a person and falls away when the bibliography changes', async () => {
    const id = await createResource(editor, canavar, input({ spoiler_level: 'yok' }));
    created.push(id);
    await reportLink(member, id).catch(() => {}); // draft: refused, nothing changes
    expect((await deskQueue(editor)).map((q) => q.id)).toContain(id);
    await approveResource(editor, id);
    const approved = await asSystem(
      (tx) =>
        tx<
          { approved_at: Date | null; approved_by: string | null }[]
        >`select approved_at, approved_by from resources where id = ${id}`,
    );
    expect(approved[0]).toMatchObject({ approved_by: editor.id });
    expect((await deskQueue(editor)).map((q) => q.id)).not.toContain(id);

    // a spelling fix in the note keeps the approval; a new link does not
    await updateResource(editor, id, input({ spoiler_level: 'yok', note: 'düzeltme' }));
    expect(
      (
        await asSystem(
          (tx) => tx<{ a: Date | null }[]>`select approved_at as a from resources where id = ${id}`,
        )
      )[0]!.a,
    ).toBeInstanceOf(Date);
    await updateResource(
      editor,
      id,
      input({ spoiler_level: 'yok', note: 'düzeltme', url: 'https://example.org/yeni' }),
    );
    expect(
      (
        await asSystem(
          (tx) => tx<{ a: Date | null }[]>`select approved_at as a from resources where id = ${id}`,
        )
      )[0]!.a,
    ).toBeNull();
  });

  it('members cannot approve or read the queue', async () => {
    const id = await resource(canavar, { layer: 'once', status: 'yayinda' });
    await expect(approveResource(member, id)).rejects.toThrow(/not found/);
    expect(await deskQueue(member)).toEqual([]);
  });
});
