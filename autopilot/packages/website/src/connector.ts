/**
 * The WebsiteConnector seam.
 *
 * Every write to a customer's website goes through this interface, and every write is
 * required to be describable, diffable and reversible BEFORE it happens. A connector that
 * cannot undo an operation must declare that it cannot perform it — there is no path where
 * the agent changes something it cannot put back.
 *
 * Capabilities are declared rather than discovered. A platform we have not integrated
 * returns NOT_IMPLEMENTED explicitly; it never silently no-ops, because a silent no-op
 * would be reported to the customer as a completed optimization.
 */
import { AppError, notImplemented } from '@autopilot/shared/errors.ts'

export type ConnectorId = 'generic' | 'wordpress' | 'shopify' | 'webflow' | 'wix' | 'memory'

export interface ConnectorCapabilities {
  readonly read: boolean
  readonly updateMetadata: boolean
  readonly updateContent: boolean
  readonly updateSchema: boolean
  readonly createPage: boolean
  readonly deletePage: boolean
  readonly createDraft: boolean
  readonly publish: boolean
  readonly rollback: boolean
  readonly sitemap: boolean
}

export const READ_ONLY_CAPABILITIES: ConnectorCapabilities = {
  read: true,
  updateMetadata: false,
  updateContent: false,
  updateSchema: false,
  createPage: false,
  deletePage: false,
  createDraft: false,
  publish: false,
  rollback: false,
  sitemap: false,
}

export interface RemotePage {
  readonly url: string
  readonly title: string | null
  readonly metaDescription: string | null
  readonly lang: string | null
  readonly canonical: string | null
  /** Body content in the connector's native representation (HTML or blocks). */
  readonly content: string
  readonly structuredData: readonly Record<string, unknown>[]
  /** Connector-specific handle needed to address this page again. */
  readonly ref: Record<string, unknown>
}

export interface MetadataUpdate {
  readonly title?: string
  readonly metaDescription?: string
  readonly canonical?: string
  readonly lang?: string
}

export interface ContentUpdate {
  /** Appended as a new section. Replacing wholesale is deliberately not offered. */
  readonly appendSection?: { heading: string; body: string }
  readonly replaceContent?: string
}

export interface WriteResult {
  readonly url: string
  /** Opaque handle that `rollback` needs to restore the previous state. */
  readonly undoRef: Record<string, unknown>
  readonly published: boolean
}

/**
 * The contract.
 *
 * Note what is absent: no arbitrary "execute" method, no raw HTTP passthrough, no bulk
 * delete. The surface is exactly the operations the optimization engine needs, which keeps
 * the blast radius of a confused agent bounded by design rather than by policy.
 */
export interface WebsiteConnector {
  readonly id: ConnectorId
  readonly capabilities: ConnectorCapabilities

  listPages(): Promise<readonly RemotePage[]>
  getPage(url: string): Promise<RemotePage | null>

  updateMetadata(url: string, update: MetadataUpdate): Promise<WriteResult>
  updateContent(url: string, update: ContentUpdate): Promise<WriteResult>
  updateSchema(url: string, schema: Record<string, unknown>): Promise<WriteResult>
  createPage(page: { url: string; title: string; content: string; lang?: string }): Promise<WriteResult>
  updateSitemap(urls: readonly string[]): Promise<WriteResult>

  /** Restores the exact previous state addressed by `undoRef`. */
  rollback(undoRef: Record<string, unknown>): Promise<void>

  healthCheck(): Promise<{ ok: boolean; message?: string }>
}

/**
 * Base class supplying honest NOT_IMPLEMENTED behaviour.
 *
 * A connector overrides only what it can genuinely do. Everything else fails loudly with a
 * message naming the platform, so the gap shows up in the agent's audit trail rather than
 * as a mysteriously ineffective optimization.
 */
export abstract class BaseConnector implements WebsiteConnector {
  abstract readonly id: ConnectorId
  abstract readonly capabilities: ConnectorCapabilities

  abstract listPages(): Promise<readonly RemotePage[]>
  abstract getPage(url: string): Promise<RemotePage | null>

  updateMetadata(_url: string, _update: MetadataUpdate): Promise<WriteResult> {
    return Promise.reject(this.unsupported('updateMetadata'))
  }
  updateContent(_url: string, _update: ContentUpdate): Promise<WriteResult> {
    return Promise.reject(this.unsupported('updateContent'))
  }
  updateSchema(_url: string, _schema: Record<string, unknown>): Promise<WriteResult> {
    return Promise.reject(this.unsupported('updateSchema'))
  }
  createPage(_page: { url: string; title: string; content: string }): Promise<WriteResult> {
    return Promise.reject(this.unsupported('createPage'))
  }
  updateSitemap(_urls: readonly string[]): Promise<WriteResult> {
    return Promise.reject(this.unsupported('updateSitemap'))
  }
  rollback(_undoRef: Record<string, unknown>): Promise<void> {
    return Promise.reject(this.unsupported('rollback'))
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      await this.listPages()
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'unknown error' }
    }
  }

  protected unsupported(operation: string): AppError {
    return notImplemented(`${operation} on the ${this.id} connector`)
  }
}

/** Guard used before any write: capability first, then the operation. */
export const assertCapability = (
  connector: WebsiteConnector,
  capability: keyof ConnectorCapabilities,
): void => {
  if (!connector.capabilities[capability]) {
    throw new AppError({
      code: 'NOT_IMPLEMENTED',
      message: `Connector ${connector.id} cannot ${capability}`,
      publicMessage:
        'Your website platform does not support that change automatically yet. ' +
        'We will show you exactly what to change instead.',
      details: { connector: connector.id, capability },
    })
  }
}
