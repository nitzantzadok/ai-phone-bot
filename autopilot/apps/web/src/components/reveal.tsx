'use client'

/**
 * Content that arrives as you reach it.
 *
 * One `IntersectionObserver` for the whole page rather than one per element, and each
 * element is unobserved the moment it fires: a report can carry forty of these, and forty
 * live observers re-running on every scroll frame is how a page that looks calm turns out
 * to stutter on a three-year-old phone — which is what most of this product's readers are
 * holding.
 *
 * The reveal is one-way by design. Content that fades out again as it leaves the viewport
 * is a well-known trick and a genuinely annoying one: a reader who scrolls back up to
 * re-read something should find it there, not watch it perform its entrance again.
 *
 * `rootMargin` fires slightly before the element is actually on screen, so the animation is
 * finishing as it arrives rather than starting once the reader is already looking at a
 * blank space.
 */
import { useEffect, useRef } from 'react'

export const Reveal = ({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode
  /** Milliseconds. Keep a group's total under a few hundred; a stagger you can watch is a wait. */
  delay?: number
  className?: string
}) => {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // No observer (old browser, or a test environment): show the content. Never hide
    // something because an enhancement is unavailable.
    if (typeof IntersectionObserver === 'undefined') {
      element.classList.add('revealed')
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          /* Revealed when reached — or when already passed. A jump to an anchor, a
             restored scroll position, or a flick to the bottom of a long report moves the
             viewport past elements without ever intersecting them, and those elements
             would otherwise stay invisible for good. Content permanently hidden because an
             animation did not fire is far worse than no animation. */
          const passed = entry.boundingClientRect.bottom < 0
          if (!entry.isIntersecting && !passed) continue
          entry.target.classList.add('revealed')
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.02 },
    )

    observer.observe(element)

    /* Last resort. If anything at all prevents the observer from firing, the content
       appears anyway a couple of seconds in. Nothing on this page is decoration; every
       hidden section is somebody's list of what to fix. */
    const failsafe = window.setTimeout(() => element.classList.add('revealed'), 2500)

    return () => {
      observer.disconnect()
      window.clearTimeout(failsafe)
    }
  }, [])

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={{ '--delay': `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
