/**
 * Snapshot diffing: "what changed since the last crawl?".
 *
 * Used for two things: showing a customer exactly what an automated change did, and
 * flagging confounders in an experiment (a change we did not make, during the observation
 * window, is a threat to the conclusion).
 */
import type { ParsedPage } from './parse.ts'

export interface FieldChange {
  readonly field: string
  readonly before: string | null
  readonly after: string | null
}

export interface PageDiff {
  readonly url: string
  readonly kind: 'ADDED' | 'REMOVED' | 'CHANGED' | 'UNCHANGED'
  readonly changes: readonly FieldChange[]
}

export interface SiteDiff {
  readonly pages: readonly PageDiff[]
  readonly addedCount: number
  readonly removedCount: number
  readonly changedCount: number
}

const compare = (before: ParsedPage, after: ParsedPage): FieldChange[] => {
  const changes: FieldChange[] = []
  const check = (field: string, a: string | null, b: string | null) => {
    if ((a ?? '') !== (b ?? '')) changes.push({ field, before: a, after: b })
  }
  check('title', before.title, after.title)
  check('metaDescription', before.metaDescription, after.metaDescription)
  check('h1', before.h1, after.h1)
  check('canonical', before.canonical, after.canonical)
  check('declaredLanguage', before.declaredLanguage, after.declaredLanguage)
  check(
    'schemaTypes',
    [...before.schemaTypes].sort().join(','),
    [...after.schemaTypes].sort().join(','),
  )
  if (before.contentHash !== after.contentHash) {
    changes.push({
      field: 'content',
      before: `${before.wordCount} words`,
      after: `${after.wordCount} words`,
    })
  }
  if (before.indexable !== after.indexable) {
    changes.push({
      field: 'indexable',
      before: String(before.indexable),
      after: String(after.indexable),
    })
  }
  return changes
}

export const diffCrawls = (
  before: readonly ParsedPage[],
  after: readonly ParsedPage[],
): SiteDiff => {
  const beforeMap = new Map(before.map((p) => [p.url, p]))
  const afterMap = new Map(after.map((p) => [p.url, p]))
  const pages: PageDiff[] = []

  for (const [url, afterPage] of afterMap) {
    const beforePage = beforeMap.get(url)
    if (!beforePage) {
      pages.push({ url, kind: 'ADDED', changes: [] })
      continue
    }
    const changes = compare(beforePage, afterPage)
    pages.push({ url, kind: changes.length > 0 ? 'CHANGED' : 'UNCHANGED', changes })
  }

  for (const url of beforeMap.keys()) {
    if (!afterMap.has(url)) pages.push({ url, kind: 'REMOVED', changes: [] })
  }

  return {
    pages,
    addedCount: pages.filter((p) => p.kind === 'ADDED').length,
    removedCount: pages.filter((p) => p.kind === 'REMOVED').length,
    changedCount: pages.filter((p) => p.kind === 'CHANGED').length,
  }
}

/**
 * Minimal line-based unified diff for the approval screen. Humans review changes as lines,
 * so this is what the customer sees before approving an automated edit.
 */
export const unifiedDiff = (before: string, after: string, label = 'content'): string => {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  const out: string[] = [`--- ${label} (before)`, `+++ ${label} (after)`]

  let i = 0
  let j = 0
  while (i < beforeLines.length || j < afterLines.length) {
    const b = beforeLines[i]
    const a = afterLines[j]
    if (b === a) {
      if (b !== undefined) out.push(` ${b}`)
      i++
      j++
      continue
    }
    // Look ahead a little to resynchronise after an insertion or a deletion.
    const resyncInAfter = b !== undefined ? afterLines.indexOf(b, j) : -1
    const resyncInBefore = a !== undefined ? beforeLines.indexOf(a, i) : -1

    if (resyncInAfter !== -1 && resyncInAfter - j <= 5) {
      for (let k = j; k < resyncInAfter; k++) out.push(`+${afterLines[k]}`)
      j = resyncInAfter
    } else if (resyncInBefore !== -1 && resyncInBefore - i <= 5) {
      for (let k = i; k < resyncInBefore; k++) out.push(`-${beforeLines[k]}`)
      i = resyncInBefore
    } else {
      if (b !== undefined) out.push(`-${b}`)
      if (a !== undefined) out.push(`+${a}`)
      i++
      j++
    }
  }
  return out.join('\n')
}
