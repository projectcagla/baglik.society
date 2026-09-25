import type postgres from 'postgres';

/**
 * Test-only: plays the editor who, before the night, opened each Canavar
 * source, adopted the suggested rationale and approved + published it.
 * Runs with a member in context, because the database accepts an approval
 * only from a person (0004). Never used outside test and e2e setup.
 */
export async function approveAndPublishForTests(
  sql: postgres.Sql,
  editorId: string,
  slug = '002-canavar',
) {
  await sql.begin(async (tx) => {
    await tx`select set_config('app.member_id', ${editorId}, true)`;
    await tx`update resources r set rationale = coalesce(r.rationale, r.rationale_draft), approved_at = now()
               from films f where f.id = r.film_id and f.slug = ${slug} and r.url is not null`;
    await tx`update resources r set status = 'yayinda', published_at = now()
               from films f where f.id = r.film_id and f.slug = ${slug}`;
  });
}

export async function fixtureEditor(sql: postgres.Sql): Promise<string> {
  const [m] = await sql<{ id: string }[]>`
    insert into members (display_name, email, role, status, activated_at)
    values ('fikstür editör', 'fikstur.editor@example.test', 'editor', 'active', now())
    returning id`;
  return m!.id;
}
