import { Fragment, type ReactNode } from 'react';

// Editorial text is stored as plain text with a tiny, predictable syntax.
// It is rendered into React elements — never through innerHTML — so markup
// typed into the editor can not become HTML. Supported:
//   blank line        new paragraph
//   ## başlık         heading
//   > alıntı          quotation
//   ? soru            a question set apart
//   *italik*  **kalın**  [metin](https://adres)

export type Block =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'question'; text: string };

export function parseBlocks(src: string | null | undefined): Block[] {
  if (!src) return [];
  return src
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk): Block => {
      if (chunk.startsWith('## ')) return { type: 'h', text: chunk.slice(3).trim() };
      if (chunk.startsWith('> '))
        return { type: 'quote', text: chunk.replace(/^>\s?/gm, '').trim() };
      if (chunk.startsWith('? ')) return { type: 'question', text: chunk.slice(2).trim() };
      return { type: 'p', text: chunk };
    });
}

export function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g;

export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  text.split('\n').forEach((line, li) => {
    if (li > 0) out.push(<br key={`br${li}`} />);
    line.split(INLINE).forEach((part, i) => {
      const key = `${li}-${i}`;
      if (!part) return;
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        out.push(<strong key={key}>{part.slice(2, -2)}</strong>);
      } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        out.push(<em key={key}>{part.slice(1, -1)}</em>);
      } else if (part.startsWith('[')) {
        const m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
        const href = m ? safeHref(m[2]!) : null;
        out.push(
          href ? (
            <a key={key} href={href} target="_blank" rel="noopener noreferrer external">
              {m![1]}
            </a>
          ) : (
            <Fragment key={key}>{part}</Fragment>
          ),
        );
      } else {
        out.push(<Fragment key={key}>{part}</Fragment>);
      }
    });
  });
  return out;
}

export function RichText({
  source,
  className,
}: {
  source: string | null | undefined;
  className?: string;
}) {
  const blocks = parseBlocks(source);
  if (!blocks.length) return null;
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h':
            return <h3 key={i}>{renderInline(b.text)}</h3>;
          case 'quote':
            return <blockquote key={i}>{renderInline(b.text)}</blockquote>;
          case 'question':
            return (
              <p key={i} data-question="">
                {renderInline(b.text)}
              </p>
            );
          default:
            return <p key={i}>{renderInline(b.text)}</p>;
        }
      })}
    </div>
  );
}
