'use client'

/**
 * Renders a support-ticket / comment body as markdown.
 *
 * Why: admins frequently paste structured replies (bullets, bold,
 * inline code) but the prior renderer was a plain whitespace-pre-wrap
 * paragraph, so `**bold**` and `- bullets` showed as literal characters
 * to the advisor on the receiving end. This wrapper turns the same
 * source string into proper formatting without changing how an admin
 * composes the reply (still a plain textarea — they just write
 * markdown, like Slack/GitHub).
 *
 * Notes:
 *   - HTML in source is NOT rendered (react-markdown default) — keeps
 *     stray paste-from-Word tags from injecting layout.
 *   - Auto-linking via remark-gfm handles bare URLs, mirroring the
 *     prior LinkifiedText behavior. We override the `a` renderer to
 *     match the gold link styling used elsewhere.
 *   - Component overrides keep the prose tight and consistent with the
 *     existing comment-thread look (text-sm, text-foreground, gold
 *     bullet markers, accent-bordered blockquotes).
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownBodyProps {
  children: string
  className?: string
}

export function MarkdownBody({ children, className }: MarkdownBodyProps) {
  if (!children) return null

  return (
    <div
      className={cn(
        'text-sm text-foreground leading-relaxed space-y-2.5 [overflow-wrap:anywhere]',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
          a: ({ children, href }) => (
            <a
              href={href ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold underline underline-offset-2 hover:text-gold/80 break-all"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 space-y-1 marker:text-gold">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 space-y-1 marker:text-gold">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => (
            <code className="rounded bg-bg-card-hover px-1 py-0.5 text-[0.85em] font-mono text-foreground">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="rounded bg-bg-card-hover p-3 text-xs font-mono text-foreground overflow-x-auto">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-gold/50 pl-3 text-text-dim italic">
              {children}
            </blockquote>
          ),
          h1: ({ children }) => <h1 className="text-base font-semibold text-foreground mt-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold text-foreground mt-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-foreground mt-2">{children}</h3>,
          hr: () => <hr className="border-border-default" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
