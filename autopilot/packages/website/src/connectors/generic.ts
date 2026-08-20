/**
 * Generic read-only connector.
 *
 * The fallback for any website we can reach but cannot write to, which is the majority at
 * first contact. Being explicitly read-only is the point: the customer still gets the full
 * diagnosis and a precise list of changes, and the product never pretends to have applied
 * something it could not.
 */
import { crawlSite, type CrawlOptions } from '@autopilot/crawler/crawler.ts'
import {
  BaseConnector,
  READ_ONLY_CAPABILITIES,
  type ConnectorCapabilities,
  type ConnectorId,
  type RemotePage,
} from '../connector.ts'

export class GenericConnector extends BaseConnector {
  readonly id: ConnectorId = 'generic'
  readonly capabilities: ConnectorCapabilities = READ_ONLY_CAPABILITIES

  private cache: RemotePage[] | null = null

  constructor(
    private readonly rootUrl: string,
    private readonly crawlOptions: CrawlOptions = {},
  ) {
    super()
  }

  async listPages(): Promise<readonly RemotePage[]> {
    if (this.cache) return this.cache
    const crawl = await crawlSite(this.rootUrl, this.crawlOptions)
    this.cache = crawl.pages.map((page) => ({
      url: page.url,
      title: page.title,
      metaDescription: page.metaDescription,
      lang: page.declaredLanguage,
      canonical: page.canonical,
      content: page.bodyText,
      structuredData: page.structuredData as Record<string, unknown>[],
      ref: { url: page.url },
    }))
    return this.cache
  }

  async getPage(url: string): Promise<RemotePage | null> {
    return (await this.listPages()).find((p) => p.url === url) ?? null
  }
}
