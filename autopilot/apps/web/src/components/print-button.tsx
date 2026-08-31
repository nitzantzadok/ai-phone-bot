'use client'

/**
 * Print, or save as PDF.
 *
 * The product's own instruction to a business owner is to forward the technical half of
 * the report to whoever built their site. That hand-off happens as a PDF or on paper far
 * more often than by copying a page of a web app, and a browser's print command is buried
 * in a menu most of this audience does not open. One button makes the path the product
 * already recommends an actual path.
 *
 * It hides itself from the printout, which is the one thing a print button must do.
 */
export const PrintButton = ({ language }: { language: 'he' | 'en' }) => (
  <button
    type="button"
    onClick={() => window.print()}
    className="no-print rounded-lg border border-line px-3.5 py-2 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
  >
    {language === 'he' ? 'הדפסה / שמירה כ-PDF' : 'Print or save as PDF'}
  </button>
)
