import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { RichText, parseBlocks, safeHref } from '@/lib/richtext';

const html = (src: string) => renderToStaticMarkup(createElement(RichText, { source: src }));

describe('editorial rich text', () => {
  it('parses blocks', () => {
    expect(parseBlocks('a\n\n## b\n\n> c\n\n? d').map((b) => b.type)).toEqual([
      'p',
      'h',
      'quote',
      'question',
    ]);
  });

  it('never emits HTML from the source', () => {
    const out = html('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;script&gt;');
  });

  it('only links http(s) targets, with safe rel', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
    const out = html('[kaynak](javascript:alert(1)) ve [bfi](https://www.bfi.org.uk/)');
    expect(out).not.toContain('href="javascript');
    expect(out).toContain('href="https://www.bfi.org.uk/"');
    expect(out).toContain('rel="noopener noreferrer external"');
  });

  it('renders emphasis', () => {
    expect(html('*italik* ve **kalın**')).toBe(
      '<div><p><em>italik</em> ve <strong>kalın</strong></p></div>',
    );
  });
});
