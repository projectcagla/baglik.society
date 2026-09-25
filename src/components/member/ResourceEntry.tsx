import type { ResourceMark, ResourceRow } from '@/server/dal/films';
import { markAction } from '@/server/actions/member';
import { RichText, parseBlocks, safeHref } from '@/lib/richtext';
import { KIND_LABELS, LANGUAGE_NAMES, brandLower } from '@/lib/text';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { LinkReport } from './LinkReport';
import styles from './Reading.module.css';
import ed from './Editorial.module.css';

export function anchorOf(r: { id: string }) {
  return `k-${r.id.slice(0, 8)}`;
}

/** Long notes fold after their first paragraph; <details> works without JS. */
const FOLD_WORDS = 170;

function Note({ source, className }: { source: string | null; className?: string }) {
  if (!source) return null;
  const words = source.trim().split(/\s+/).length;
  const blocks = parseBlocks(source);
  if (words <= FOLD_WORDS || blocks.length < 2)
    return <RichText source={source} className={className} />;
  const [first, ...rest] = source.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  return (
    <div className={className}>
      <RichText source={first ?? ''} className={styles.noteInner} />
      <details className={styles.more}>
        <summary>notun devamı</summary>
        <RichText source={rest.join('\n\n')} className={styles.noteInner} />
      </details>
    </div>
  );
}

/**
 * One editorial source record. Order on the page: what it is (curator's
 * heading, bibliographic line), why it was chosen, the curator's own Turkish
 * note, then the way out to the original — with any spoiler or access caveat
 * stated before the link, never hidden by CSS.
 */
export function ResourceEntry({
  r,
  index,
  total,
  mark,
  path,
  compact = false,
}: {
  r: ResourceRow;
  index: number;
  total: number;
  mark?: ResourceMark;
  path: string;
  compact?: boolean;
}) {
  const href = r.url ? safeHref(r.url) : null;
  const citation = [
    r.publication,
    r.author,
    r.form_label ? brandLower(r.form_label) : null,
    r.published_year,
    r.duration_note,
  ].filter(Boolean);
  const facts = [
    KIND_LABELS[r.kind],
    r.language && r.language !== 'tr' ? (LANGUAGE_NAMES[r.language] ?? r.language) : null,
    r.source_minutes ? `özgün metin ~${r.source_minutes} dk` : null,
    r.spoiler_level === 'yok'
      ? 'spoiler yok'
      : r.spoiler_level === 'belirtilmedi'
        ? 'spoiler durumu belirtilmedi'
        : null,
  ].filter(Boolean);
  const title = r.heading ?? r.title_original ?? '';
  const spoiler =
    r.spoiler_level === 'var'
      ? 'bu kaynak filmin olaylarını açık ediyor. izledikten sonra açman önerilir.'
      : r.spoiler_level === 'hafif'
        ? 'bu kaynak filmin konusuna dair bilgi içeriyor; izlemeden önce açmak istemeyebilirsin.'
        : null;
  const id = anchorOf(r);

  return (
    <article
      id={id}
      data-reading-anchor={id}
      data-reading-title={title}
      className={compact ? styles.compact : styles.entry}
      aria-labelledby={`${id}-t`}
    >
      {total > 1 && (
        <p className={styles.count}>
          {String(index).padStart(2, '0')}{' '}
          <span>
            / {String(total).padStart(2, '0')}
            <span className="visually-hidden"> kaynak</span>
          </span>
        </p>
      )}
      <h2 id={`${id}-t`} className={compact ? ed.h3 : styles.heading}>
        {title}
        {r.status === 'taslak' && <span className={`${ed.badge} ${ed.badgeDraft}`}> taslak</span>}
      </h2>
      {r.heading &&
        r.title_original &&
        !r.heading.toLocaleLowerCase('tr').includes(r.title_original.toLocaleLowerCase('tr')) && (
          <p className={styles.original} lang={r.language ?? undefined}>
            {r.title_original}
          </p>
        )}
      {citation.length > 0 && <p className={styles.citation}>{citation.join(' · ')}</p>}
      {facts.length > 0 && <p className={styles.labels}>{facts.join(' · ')}</p>}

      {r.rationale && (
        <p className={styles.rationale}>
          <span className={styles.rationaleLabel}>neden bu kaynak</span>
          {r.rationale}
        </p>
      )}

      <Note source={r.note} className={compact ? styles.noteSmall : styles.note} />

      {r.quote && (
        <figure className={styles.quote}>
          <blockquote lang={r.language ?? undefined}>{r.quote}</blockquote>
          {r.quote_credit && <figcaption className="meta">{r.quote_credit}</figcaption>}
        </figure>
      )}

      {spoiler && (
        <p className={styles.spoiler} role="note">
          <span aria-hidden="true">◐ </span>
          <strong>spoiler uyarısı · </strong>
          {spoiler}
        </p>
      )}

      {href && (
        <div className={styles.source}>
          <ExternalLink href={href} className={styles.sourceLink}>
            {brandLower(r.link_label) || 'özgün kaynağa git'}
          </ExternalLink>
          <span className={styles.sourceHint}>
            {[r.link_hint, r.access_note].filter(Boolean).join(' · ') ||
              'kaynak site üzerinden açılır'}
          </span>
          {(r.link_status === 'kirik' || r.link_status === 'hata') && (
            <span className={styles.sourceWarn}>
              {r.link_status === 'kirik'
                ? 'bu bağlantı son denetimde bulunamadı; editör kontrol ediyor.'
                : 'site son denetimde yanıt vermedi (abonelik ya da erişim sınırı olabilir).'}
            </span>
          )}
        </div>
      )}

      {r.prompt && (
        <aside className={styles.prompt} aria-label="düşünmek için">
          <span className="meta">not</span>
          <p>{r.prompt}</p>
        </aside>
      )}

      <div className={`${styles.marks} no-print`}>
        <form action={markAction}>
          <input type="hidden" name="resourceId" value={r.id} />
          <input type="hidden" name="field" value="read" />
          <input type="hidden" name="on" value={mark?.read_at ? '0' : '1'} />
          <input type="hidden" name="path" value={path} />
          <button type="submit" className={styles.mark} aria-pressed={!!mark?.read_at}>
            {mark?.read_at ? 'okudum ✓' : 'okudum'}
          </button>
        </form>
        <form action={markAction}>
          <input type="hidden" name="resourceId" value={r.id} />
          <input type="hidden" name="field" value="saved" />
          <input type="hidden" name="on" value={mark?.saved_at ? '0' : '1'} />
          <input type="hidden" name="path" value={path} />
          <button type="submit" className={styles.mark} aria-pressed={!!mark?.saved_at}>
            {mark?.saved_at ? 'sonra oku ✓' : 'sonra oku'}
          </button>
        </form>
        {href && <LinkReport resourceId={r.id} />}
      </div>
    </article>
  );
}
