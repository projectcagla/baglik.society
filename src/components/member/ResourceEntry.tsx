import type { ResourceMark, ResourceRow } from '@/server/dal/films';
import { markAction } from '@/server/actions/member';
import { RichText, safeHref } from '@/lib/richtext';
import { KIND_LABELS, LANGUAGE_NAMES, SPOILER_LABELS, brandLower } from '@/lib/text';
import { ExternalLink } from '@/components/ui/ExternalLink';
import styles from './Reading.module.css';
import ed from './Editorial.module.css';

export function anchorOf(r: { id: string }) {
  return `k-${r.id.slice(0, 8)}`;
}

/** One editorial source record: Turkish note large, source identity small. */
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
  const labels = [
    r.language && r.language !== 'tr' ? LANGUAGE_NAMES[r.language] ?? r.language : null,
    SPOILER_LABELS[r.spoiler_level],
  ].filter(Boolean);
  const title = r.heading ?? r.title_original ?? '';

  return (
    <article id={anchorOf(r)} className={compact ? styles.compact : styles.entry} aria-labelledby={`${anchorOf(r)}-t`}>
      {total > 1 && (
        <p className={styles.count} aria-hidden={compact || undefined}>
          {String(index).padStart(2, '0')} <span>/ {String(total).padStart(2, '0')}</span>
        </p>
      )}
      <h2 id={`${anchorOf(r)}-t`} className={compact ? ed.h3 : styles.heading}>
        {title}
        {r.status === 'taslak' && <span className={`${ed.badge} ${ed.badgeDraft}`}> taslak</span>}
      </h2>
      {citation.length > 0 && <p className={styles.citation}>{citation.join(' · ')}</p>}
      {r.heading && r.title_original && r.title_original !== r.heading && (
        <p className={styles.original} lang={r.language ?? undefined}>
          {r.title_original}
        </p>
      )}
      {labels.length > 0 && <p className={styles.labels}>{labels.join(' · ')}</p>}

      <RichText source={r.note} className={compact ? styles.noteSmall : styles.note} />

      {r.quote && (
        <figure className={styles.quote}>
          <blockquote lang={r.language ?? undefined}>{r.quote}</blockquote>
          {r.quote_credit && <figcaption className="meta">{r.quote_credit}</figcaption>}
        </figure>
      )}

      {href && (
        <p className={styles.source}>
          <ExternalLink href={href} className={styles.sourceLink}>
            {brandLower(r.link_label) || 'kaynağa git'}
          </ExternalLink>
          {(r.link_hint || r.access_note) && (
            <span className={styles.sourceHint}>{[r.link_hint, r.access_note].filter(Boolean).join(' · ')}</span>
          )}
          {r.link_status === 'kirik' && <span className={styles.sourceHint}>bağlantı son denetimde yanıt vermedi</span>}
        </p>
      )}

      {r.prompt && (
        <aside className={styles.prompt} aria-label="not">
          <span className="meta">not</span>
          <p>{r.prompt}</p>
        </aside>
      )}

      {!compact && (
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
              {mark?.saved_at ? 'kaydedildi ✓' : 'kaydet'}
            </button>
          </form>
          <span className={styles.kind}>{KIND_LABELS[r.kind]}</span>
        </div>
      )}
    </article>
  );
}
