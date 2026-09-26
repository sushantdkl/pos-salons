import { Fragment } from 'react';

/**
 * Plain-text body from the CMS → paragraphs, "## " sub-headings and "- " bullet lists.
 * Rendered as React text (never HTML), so staff can't break the page or inject markup.
 */
export function RichText({ body, className = '' }: { body: string; className?: string }) {
  const blocks = String(body || '').replace(/\r\n/g, '\n').split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return (
    <div className={`space-y-5 text-base leading-relaxed text-[#3b342f] ${className}`}>
      {blocks.map((block, index) => {
        if (block.startsWith('## ')) {
          return <h2 key={index} className="pt-3 font-serif text-2xl font-light text-[#171411] md:text-3xl">{block.slice(3)}</h2>;
        }
        if (block.startsWith('### ')) {
          return <h3 key={index} className="pt-2 text-lg font-semibold text-[#171411]">{block.slice(4)}</h3>;
        }
        const lines = block.split('\n');
        if (lines.every((line) => /^[-*] /.test(line))) {
          return (
            <ul key={index} className="list-disc space-y-2 pl-5">
              {lines.map((line, i) => <li key={i}>{line.slice(2)}</li>)}
            </ul>
          );
        }
        return (
          <p key={index}>
            {lines.map((line, i) => <Fragment key={i}>{i ? <br /> : null}{line}</Fragment>)}
          </p>
        );
      })}
    </div>
  );
}
