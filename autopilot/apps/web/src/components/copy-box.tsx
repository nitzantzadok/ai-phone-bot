'use client'

/**
 * A block of text with a button that copies it.
 *
 * This exists for exactly one moment in the product: the business owner has read the
 * report, understood that four of the nine items need somebody who edits HTML, and is
 * about to forward them. Everything up to here is wasted if that forward is hard — and
 * "select the text below and copy it" on a phone, in a right-to-left page, over a block
 * that contains a code snippet, is hard.
 *
 * The button is the only client-side JavaScript in the report. The text is in the page
 * either way, so a reader with JavaScript disabled loses the convenience and nothing else.
 */
import { useState } from 'react'

export const CopyBox = ({
  text,
  label,
  copiedLabel,
  children,
}: {
  text: string
  label: string
  copiedLabel: string
  children: React.ReactNode
}) => {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      // Clipboard access is refused in some browsers and in every insecure context. The
      // text is selectable on the page, so failing silently leaves the reader exactly
      // where they would have been without the button — never in an error state over
      // something this incidental.
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={copy}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {copied ? copiedLabel : label}
        </button>
      </div>
      {children}
    </div>
  )
}
