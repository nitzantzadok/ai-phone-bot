/**
 * In-memory connector.
 *
 * Backs a real, mutable website in tests and in the demo. It is not a stub: it stores page
 * state, applies genuine edits, and implements rollback by keeping the previous version,
 * which means the rollback tests exercise the same code path a real connector must satisfy.
 */
import { randomUUID } from 'node:crypto'
import { notFound } from '@autopilot/shared/errors.ts'
import {
  BaseConnector,
  type ConnectorCapabilities,
  type ConnectorId,
  type ContentUpdate,
  type MetadataUpdate,
  type RemotePage,
  type WriteResult,
} from '../connector.ts'

interface StoredPage {
  url: string
  title: string | null
  metaDescription: string | null
  lang: string | null
  canonical: string | null
  content: string
  structuredData: Record<string, unknown>[]
}

interface UndoEntry {
  readonly url: string
  /** Null means the page did not exist and rollback should remove it. */
  readonly previous: StoredPage | null
}

export class MemoryConnector extends BaseConnector {
  readonly id: ConnectorId = 'memory'
  readonly capabilities: ConnectorCapabilities = {
    read: true,
    updateMetadata: true,
    updateContent: true,
    updateSchema: true,
    createPage: true,
    deletePage: false,
    createDraft: true,
    publish: true,
    rollback: true,
    sitemap: true,
  }

  private readonly pages = new Map<string, StoredPage>()
  private readonly undo = new Map<string, UndoEntry>()
  private sitemapUrls: readonly string[] = []

  constructor(initial: readonly Partial<StoredPage>[] = []) {
    super()
    for (const page of initial) {
      if (!page.url) continue
      this.pages.set(page.url, {
        url: page.url,
        title: page.title ?? null,
        metaDescription: page.metaDescription ?? null,
        lang: page.lang ?? null,
        canonical: page.canonical ?? null,
        content: page.content ?? '',
        structuredData: page.structuredData ?? [],
      })
    }
  }

  async listPages(): Promise<readonly RemotePage[]> {
    return [...this.pages.values()].map(toRemote)
  }

  async getPage(url: string): Promise<RemotePage | null> {
    const page = this.pages.get(url)
    return page ? toRemote(page) : null
  }

  override async updateMetadata(url: string, update: MetadataUpdate): Promise<WriteResult> {
    const page = this.require(url)
    const undoRef = this.snapshot(url, page)
    if (update.title !== undefined) page.title = update.title
    if (update.metaDescription !== undefined) page.metaDescription = update.metaDescription
    if (update.canonical !== undefined) page.canonical = update.canonical
    if (update.lang !== undefined) page.lang = update.lang
    return { url, undoRef, published: true }
  }

  override async updateContent(url: string, update: ContentUpdate): Promise<WriteResult> {
    const page = this.require(url)
    const undoRef = this.snapshot(url, page)
    if (update.replaceContent !== undefined) {
      page.content = update.replaceContent
    }
    if (update.appendSection) {
      page.content += `\n<section><h2>${update.appendSection.heading}</h2><p>${update.appendSection.body}</p></section>`
    }
    return { url, undoRef, published: true }
  }

  override async updateSchema(url: string, schema: Record<string, unknown>): Promise<WriteResult> {
    const page = this.require(url)
    const undoRef = this.snapshot(url, page)
    const type = schema['@type']
    // Replace markup of the same type rather than accumulating duplicates.
    page.structuredData = [
      ...page.structuredData.filter((existing) => existing['@type'] !== type),
      schema,
    ]
    return { url, undoRef, published: true }
  }

  override async createPage(page: {
    url: string
    title: string
    content: string
    lang?: string
  }): Promise<WriteResult> {
    const undoRef = randomUUID()
    this.undo.set(undoRef, { url: page.url, previous: null })
    this.pages.set(page.url, {
      url: page.url,
      title: page.title,
      metaDescription: null,
      lang: page.lang ?? null,
      canonical: page.url,
      content: page.content,
      structuredData: [],
    })
    return { url: page.url, undoRef: { id: undoRef }, published: true }
  }

  override async updateSitemap(urls: readonly string[]): Promise<WriteResult> {
    const undoRef = randomUUID()
    const previous = this.sitemapUrls
    this.undo.set(undoRef, { url: '/sitemap.xml', previous: null })
    this.sitemapSnapshots.set(undoRef, previous)
    this.sitemapUrls = [...urls]
    return { url: '/sitemap.xml', undoRef: { id: undoRef, kind: 'sitemap' }, published: true }
  }

  override async rollback(undoRef: Record<string, unknown>): Promise<void> {
    const id = String(undoRef.id ?? '')
    if (undoRef.kind === 'sitemap') {
      const previous = this.sitemapSnapshots.get(id)
      if (previous) this.sitemapUrls = previous
      this.sitemapSnapshots.delete(id)
      this.undo.delete(id)
      return
    }
    const entry = this.undo.get(id)
    if (!entry) throw notFound(`Undo reference ${id}`)
    if (entry.previous === null) this.pages.delete(entry.url)
    else this.pages.set(entry.url, { ...entry.previous })
    this.undo.delete(id)
  }

  private readonly sitemapSnapshots = new Map<string, readonly string[]>()

  get sitemap(): readonly string[] {
    return this.sitemapUrls
  }

  private require(url: string): StoredPage {
    const page = this.pages.get(url)
    if (!page) throw notFound(`Page ${url}`)
    return page
  }

  /** Deep-copies the current state so rollback restores it exactly. */
  private snapshot(url: string, page: StoredPage): Record<string, unknown> {
    const id = randomUUID()
    this.undo.set(id, {
      url,
      previous: { ...page, structuredData: page.structuredData.map((s) => ({ ...s })) },
    })
    return { id }
  }
}

const toRemote = (page: StoredPage): RemotePage => ({
  url: page.url,
  title: page.title,
  metaDescription: page.metaDescription,
  lang: page.lang,
  canonical: page.canonical,
  content: page.content,
  structuredData: page.structuredData,
  ref: { url: page.url },
})
