import React from 'react'

// Auto-detect http(s):// URLs and bare www. URLs in pasted text and render
// them as clickable links. Preserves the surrounding text including line
// breaks (caller wraps with whitespace-pre-wrap as needed).
//
// Conservative regex — matches the common shapes (loom.com, youtube.com,
// retirementexpert.ai, etc.) without trying to handle every RFC-3986 edge
// case. Trailing punctuation that's almost certainly NOT part of the URL
// (.,;:!?) gets trimmed back to text.
const URL_REGEX = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi
const TRAILING_PUNCT = /[.,;:!?)\]}>]+$/

export function LinkifiedText({ children, className }: { children: string; className?: string }) {
  if (!children) return null

  const parts: Array<React.ReactNode> = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  // Reset lastIndex on the regex to keep this component pure
  URL_REGEX.lastIndex = 0
  let key = 0

  while ((match = URL_REGEX.exec(children)) !== null) {
    let url = match[0]
    let trailing = ''
    // Pull trailing punctuation off the URL match — it's usually sentence
    // punctuation, not part of the link.
    const trailMatch = url.match(TRAILING_PUNCT)
    if (trailMatch) {
      trailing = trailMatch[0]
      url = url.slice(0, -trailing.length)
    }

    if (match.index > lastIndex) {
      parts.push(children.slice(lastIndex, match.index))
    }

    const href = url.startsWith('www.') ? `https://${url}` : url
    parts.push(
      <a
        key={`link-${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-gold underline underline-offset-2 hover:text-gold/80 break-all"
      >
        {url}
      </a>
    )
    if (trailing) parts.push(trailing)
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < children.length) {
    parts.push(children.slice(lastIndex))
  }

  return <span className={className}>{parts}</span>
}
