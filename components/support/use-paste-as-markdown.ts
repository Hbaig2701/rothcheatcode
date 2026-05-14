'use client'

/**
 * Returns a paste handler that converts rich-text HTML on the clipboard
 * into markdown before inserting it into a textarea.
 *
 * Why: the support reply textarea is plain text, and the comment
 * renderer (MarkdownBody) expects markdown. When an admin copies a
 * formatted draft from somewhere — Claude chat, Slack, Word, GitHub —
 * the browser puts both `text/plain` and `text/html` on the clipboard.
 * The default textarea paste only consumes `text/plain`, which strips
 * every formatting marker (bullets, bold, headings) and leaves a wall
 * of text that the renderer has nothing to format.
 *
 * This hook checks the clipboard for `text/html` first. If present, it
 * runs it through turndown (HTML → markdown) and inserts the result at
 * the current cursor position, replacing any selection. If not, it
 * lets the default plain-text paste happen.
 *
 * Result: paste a bulleted list and you get `- item` lines in the
 * textarea, which then render as a real bullet list when posted.
 */

import TurndownService from 'turndown'
import { useCallback, useMemo } from 'react'

type SetValue = (next: string) => void

export function usePasteAsMarkdown(setValue: SetValue) {
  const turndown = useMemo(() => {
    const td = new TurndownService({
      headingStyle: 'atx',         // # / ##, not the underline syntax
      bulletListMarker: '-',       // - bullet, matches MarkdownBody styling
      codeBlockStyle: 'fenced',    // ``` fenced blocks
      emDelimiter: '*',
      strongDelimiter: '**',
    })
    // Treat a copied bare URL as a real markdown link so we don't lose
    // the href when pasting from a styled link.
    td.addRule('keep-link-href', {
      filter: ['a'],
      replacement: (content, node) => {
        const a = node as HTMLAnchorElement
        const href = a.getAttribute('href') ?? ''
        const text = (content || a.textContent || href).trim()
        if (!href) return text
        if (text === href) return href
        return `[${text}](${href})`
      },
    })
    return td
  }, [])

  return useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const html = e.clipboardData.getData('text/html')
      if (!html) return // let the default plain-text paste happen

      e.preventDefault()
      const markdown = turndown.turndown(html).trim()
      if (!markdown) return

      const textarea = e.currentTarget
      const start = textarea.selectionStart ?? textarea.value.length
      const end = textarea.selectionEnd ?? textarea.value.length
      const next = textarea.value.slice(0, start) + markdown + textarea.value.slice(end)
      setValue(next)

      // Restore caret to the end of the pasted content so the user can
      // keep typing. requestAnimationFrame waits for React to flush the
      // controlled value back into the DOM before we set the selection.
      const cursor = start + markdown.length
      requestAnimationFrame(() => {
        try {
          textarea.setSelectionRange(cursor, cursor)
        } catch {
          // setSelectionRange can throw if the textarea has been
          // unmounted between the paste and the rAF callback. Non-fatal.
        }
      })
    },
    [turndown, setValue],
  )
}
