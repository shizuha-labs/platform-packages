/**
 * MarkdownBubble — renders chat message content with inline markdown.
 *
 * Constraints for a chat bubble context:
 *  - Content is typically short — headings / huge blocks are rare, but we
 *    support them so agents posting plans don't show raw ## / **bold**.
 *  - Must stay inside the parent bubble (no blown-out images, no wide
 *    tables). Overflow is scrollable rather than breaking layout.
 *  - Tight vertical rhythm — default prose margins are too airy for 1–3
 *    line messages.
 *  - Safe links — every anchor gets target="_blank" + rel="noopener".
 *  - Dark-mode / sender-side aware via two `variant` modes.
 */
import type { ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Variant = 'own' | 'other'

interface MarkdownBubbleProps {
  content: string
  variant: Variant
}

// Colour tokens that vary by bubble side. `own` sits on brand-600 bg so
// links/code need high-contrast white-ish tones; `other` sits on gray-100
// (light) / gray-800 (dark) so links get the usual blue-600/400.
const styles: Record<Variant, { link: string; code: string; codeBlock: string; border: string }> = {
  own: {
    link: 'text-white underline underline-offset-2 hover:opacity-90',
    code: 'bg-white/20 text-white rounded px-1 py-0.5 text-[12px]',
    codeBlock: 'bg-white/15 text-white rounded p-2 my-1 overflow-x-auto text-[12px]',
    border: 'border-white/30',
  },
  other: {
    link: 'text-brand-600 dark:text-brand-400 underline underline-offset-2 hover:opacity-90',
    code: 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-1 py-0.5 text-[12px]',
    codeBlock:
      'bg-gray-200 dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded p-2 my-1 overflow-x-auto text-[12px]',
    border: 'border-gray-300 dark:border-gray-600',
  },
}

export function MarkdownBubble({ content, variant }: MarkdownBubbleProps) {
  const s = styles[variant]

  const components: Components = {
    // Paragraphs — no outer margin, tight stacking.
    p: ({ children }) => <p className="m-0 whitespace-pre-wrap break-words">{children}</p>,
    // Fenced code block — react-markdown v10 routes fenced blocks through
    // the `pre` element (not `code` with inline=false, which was deprecated).
    // Our own `<pre>` replaces the default so we can apply bubble-variant
    // styling; we strip the inner `<code>`'s className to avoid doubled-up
    // monospace fonts.
    pre: ({ children }) => (
      <pre className={`${s.codeBlock} font-mono whitespace-pre`}>{children}</pre>
    ),
    // Inline code — this handler ONLY fires for inline `code` spans now
    // (fenced blocks are handled by `pre` above). Keep the span light.
    code: ({ className, children, ...rest }: any) => {
      // If this code node is inside a fenced block, react-markdown still
      // calls us for the inner <code>; the parent <pre> already has our
      // codeBlock styling, so render as a plain mono span without the
      // inline chip styling.
      const isFencedChild =
        typeof className === 'string' && /^language-/.test(className)
      if (isFencedChild) {
        return (
          <code className="font-mono">{children}</code>
        )
      }
      return (
        <code className={`${s.code} font-mono`} {...rest}>
          {children}
        </code>
      )
    },
    // Links — open externally, safe rel
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className={s.link}>
        {children}
      </a>
    ),
    // Lists — tight spacing, still visible bullets
    ul: ({ children }) => <ul className="list-disc pl-5 my-1 space-y-0.5">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 my-1 space-y-0.5">{children}</ol>,
    li: ({ children }) => <li className="leading-snug">{children}</li>,
    // Headings — render as slightly larger bold text, not huge display
    h1: ({ children }) => <div className="font-semibold text-[15px] mt-1 mb-0.5">{children}</div>,
    h2: ({ children }) => <div className="font-semibold text-[14px] mt-1 mb-0.5">{children}</div>,
    h3: ({ children }) => <div className="font-semibold text-[13px] mt-1 mb-0.5">{children}</div>,
    h4: ({ children }) => <div className="font-semibold mt-1 mb-0.5">{children}</div>,
    h5: ({ children }) => <div className="font-semibold mt-1 mb-0.5">{children}</div>,
    h6: ({ children }) => <div className="font-semibold mt-1 mb-0.5">{children}</div>,
    // Blockquotes — left bar in the variant's border colour
    blockquote: ({ children }) => (
      <blockquote className={`border-l-2 ${s.border} pl-2 my-1 italic opacity-90`}>
        {children as ReactNode}
      </blockquote>
    ),
    // Tables — scroll if wider than the bubble
    table: ({ children }) => (
      <div className="overflow-x-auto my-1">
        <table className="text-[12px] border-collapse">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className={`border ${s.border} px-1.5 py-0.5 font-semibold`}>{children}</th>
    ),
    td: ({ children }) => <td className={`border ${s.border} px-1.5 py-0.5`}>{children}</td>,
    // Images — clamp width so a stray large image can't blow out the bubble
    img: ({ src, alt }) => (
      <img src={src as string} alt={alt || ''} className="max-w-full rounded my-1" />
    ),
    // hr — subtle divider
    hr: () => <hr className={`my-1 border-t ${s.border}`} />,
  }

  return (
    <div className="text-sm leading-relaxed break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default MarkdownBubble
