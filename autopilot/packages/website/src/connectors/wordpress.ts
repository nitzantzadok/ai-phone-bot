/**
 * WordPress connector, via the official REST API.
 *
 * WordPress is the single most common platform among the businesses this product targets,
 * so it is the first write-capable integration.
 *
 * Two deliberate choices. Authentication uses Application Passwords, never the customer's
 * login. And every write captures the previous field values first, so `rollback` restores
 * the exact prior state rather than approximating it — WordPress revisions are not
 * guaranteed to be enabled, so we cannot rely on them.
 */
import { AppError, notFound } from '@autopilot/shared/errors.ts'
import { withRetry, withTimeout } from '@autopilot/shared/resilience.ts'
import { validateUrl, DEFAULT_SSRF_POLICY, type SsrfPolicy } from '@autopilot/crawler/ssrf.ts'
import {
  BaseConnector,
  type ConnectorCapabilities,
  type ConnectorId,
  type ContentUpdate,
  type MetadataUpdate,
  type RemotePage,
  type WriteResult,
} from '../connector.ts'

interface WpPost {
  id: number
  link: string
  title: { rendered: string; raw?: string }
  excerpt: { rendered: string; raw?: string }
  content: { rendered: string; raw?: string }
  type: string
}

export interface WordPressConnectorOptions {
  /** Site root, e.g. https://rosa.co.il */
  readonly siteUrl: string
  readonly username: string
  /** A WordPress Application Password. Never the account password. */
  readonly applicationPassword: string
  readonly timeoutMs?: number
  readonly ssrfPolicy?: SsrfPolicy
  readonly fetchImpl?: typeof fetch
  /** Test seam. Production uses the system resolver. */
  readonly dnsResolver?: Parameters<typeof validateUrl>[2]
}

export class WordPressConnector extends BaseConnector {
  readonly id: ConnectorId = 'wordpress'
  readonly capabilities: ConnectorCapabilities = {
    read: true,
    updateMetadata: true,
    updateContent: true,
    // Schema injection needs an SEO plugin or theme support we cannot assume.
    updateSchema: false,
    createPage: true,
    deletePage: false,
    createDraft: true,
    publish: true,
    rollback: true,
    sitemap: false,
  }

  private readonly base: string
  private readonly fetchImpl: typeof fetch
  private readonly undo = new Map<string, { postId: number; previous: Partial<WpPost> }>()

  constructor(private readonly options: WordPressConnectorOptions) {
    super()
    this.base = `${options.siteUrl.replace(/\/$/, '')}/wp-json/wp/v2`
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async listPages(): Promise<readonly RemotePage[]> {
    const [pages, posts] = await Promise.all([
      this.request<WpPost[]>('/pages?per_page=100&context=edit'),
      this.request<WpPost[]>('/posts?per_page=100&context=edit'),
    ])
    return [...pages, ...posts].map((post) => this.toRemote(post))
  }

  async getPage(url: string): Promise<RemotePage | null> {
    return (await this.listPages()).find((p) => p.url === url) ?? null
  }

  override async updateMetadata(url: string, update: MetadataUpdate): Promise<WriteResult> {
    const post = await this.findPost(url)
    const undoRef = this.remember(post, {
      title: post.title,
      excerpt: post.excerpt,
    })

    const body: Record<string, unknown> = {}
    if (update.title !== undefined) body.title = update.title
    // WordPress core has no meta-description field; the excerpt is what themes and SEO
    // plugins overwhelmingly map to it.
    if (update.metaDescription !== undefined) body.excerpt = update.metaDescription

    if (Object.keys(body).length === 0) {
      return { url, undoRef, published: false }
    }

    await this.request(`/${post.type === 'page' ? 'pages' : 'posts'}/${post.id}`, {
      method: 'POST',
      body,
    })
    return { url, undoRef, published: true }
  }

  override async updateContent(url: string, update: ContentUpdate): Promise<WriteResult> {
    const post = await this.findPost(url)
    const undoRef = this.remember(post, { content: post.content })

    const current = post.content.raw ?? post.content.rendered
    const next = update.replaceContent
      ? update.replaceContent
      : update.appendSection
        ? `${current}\n\n<h2>${escapeHtml(update.appendSection.heading)}</h2>\n<p>${escapeHtml(update.appendSection.body)}</p>`
        : current

    await this.request(`/${post.type === 'page' ? 'pages' : 'posts'}/${post.id}`, {
      method: 'POST',
      body: { content: next },
    })
    return { url, undoRef, published: true }
  }

  override async createPage(page: {
    url: string
    title: string
    content: string
  }): Promise<WriteResult> {
    const slug = new URL(page.url).pathname.replace(/^\/|\/$/g, '')
    const created = await this.request<WpPost>('/pages', {
      method: 'POST',
      body: {
        title: page.title,
        content: page.content,
        slug,
        // Created as a draft: a brand-new page going live unreviewed is not a low-risk act.
        status: 'draft',
      },
    })
    const undoRef = { postId: created.id, created: true }
    return { url: created.link, undoRef, published: false }
  }

  override async rollback(undoRef: Record<string, unknown>): Promise<void> {
    if (undoRef.created === true) {
      const postId = Number(undoRef.postId)
      await this.request(`/pages/${postId}`, { method: 'DELETE', body: { force: false } })
      return
    }
    const id = String(undoRef.id ?? '')
    const entry = this.undo.get(id)
    if (!entry) throw notFound(`Undo reference ${id}`)

    const body: Record<string, unknown> = {}
    if (entry.previous.title) body.title = entry.previous.title.raw ?? entry.previous.title.rendered
    if (entry.previous.excerpt) {
      body.excerpt = entry.previous.excerpt.raw ?? entry.previous.excerpt.rendered
    }
    if (entry.previous.content) {
      body.content = entry.previous.content.raw ?? entry.previous.content.rendered
    }

    await this.request(`/pages/${entry.postId}`, { method: 'POST', body })
    this.undo.delete(id)
  }

  private remember(post: WpPost, previous: Partial<WpPost>): Record<string, unknown> {
    const id = `${post.id}-${Date.now()}`
    this.undo.set(id, { postId: post.id, previous })
    return { id, postId: post.id }
  }

  private async findPost(url: string): Promise<WpPost> {
    const all = [
      ...(await this.request<WpPost[]>('/pages?per_page=100&context=edit')),
      ...(await this.request<WpPost[]>('/posts?per_page=100&context=edit')),
    ]
    const post = all.find((p) => normalizeUrl(p.link) === normalizeUrl(url))
    if (!post) throw notFound(`WordPress post for ${url}`)
    return post
  }

  private toRemote(post: WpPost): RemotePage {
    return {
      url: post.link,
      title: post.title.raw ?? stripTags(post.title.rendered),
      metaDescription: post.excerpt.raw ?? stripTags(post.excerpt.rendered),
      lang: null,
      canonical: post.link,
      content: post.content.raw ?? post.content.rendered,
      structuredData: [],
      ref: { postId: post.id, type: post.type },
    }
  }

  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const url = `${this.base}${path}`
    // The site URL is customer-supplied, so it goes through the same SSRF validation as
    // anything else we fetch.
    await validateUrl(url, this.options.ssrfPolicy ?? DEFAULT_SSRF_POLICY, this.options.dnsResolver)

    const auth = Buffer.from(
      `${this.options.username}:${this.options.applicationPassword}`,
    ).toString('base64')

    return withRetry(
      () =>
        withTimeout(async (signal) => {
          const response = await this.fetchImpl(url, {
            method: options.method ?? 'GET',
            signal,
            headers: {
              authorization: `Basic ${auth}`,
              'content-type': 'application/json',
              accept: 'application/json',
            },
            ...(options.body ? { body: JSON.stringify(options.body) } : {}),
          })

          if (!response.ok) {
            throw new AppError({
              code: response.status === 401 || response.status === 403 ? 'FORBIDDEN' : 'PROVIDER_ERROR',
              message: `WordPress ${options.method ?? 'GET'} ${path} failed with ${response.status}`,
              retryable: response.status >= 500,
              publicMessage:
                response.status === 401 || response.status === 403
                  ? 'We could not sign in to your WordPress site. Please reconnect it.'
                  : 'Your website did not accept the change. We will retry.',
              details: { status: response.status },
            })
          }

          return (await response.json()) as T
        }, this.options.timeoutMs ?? 20_000, `wordpress ${path}`),
      { isRetryable: (e) => e instanceof AppError && e.retryable },
    )
  }
}

const normalizeUrl = (url: string): string => url.replace(/\/$/, '').toLowerCase()
const stripTags = (html: string): string => html.replace(/<[^>]*>/g, '').trim()
const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
