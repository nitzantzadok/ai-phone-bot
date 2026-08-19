/**
 * Change versioning and rollback.
 *
 * The contract every automated change obeys:
 *   1. capture the before state,
 *   2. produce a human-readable diff,
 *   3. apply,
 *   4. record the undo handle.
 *
 * Step 4 is not optional. `applyChange` records the version BEFORE the connector write
 * completes, so a change that fails halfway still leaves a row explaining what was
 * attempted — the alternative is a customer's website in a state nobody can account for.
 */
import { unifiedDiff } from '@autopilot/crawler/diff.ts'
import { AppError, isAppError } from '@autopilot/shared/errors.ts'
import type { Clock } from '@autopilot/shared/clock.ts'
import { systemClock } from '@autopilot/shared/clock.ts'
import { newId, type ChangeId } from '@autopilot/shared/ids.ts'
import {
  assertCapability,
  type ConnectorCapabilities,
  type WebsiteConnector,
} from './connector.ts'

export type ChangeTarget = 'METADATA' | 'CONTENT' | 'SCHEMA' | 'TECHNICAL' | 'PAGE'
export type PublishStatus =
  | 'DRAFT'
  | 'AWAITING_APPROVAL'
  | 'PUBLISHED'
  | 'REJECTED'
  | 'ROLLED_BACK'
  | 'FAILED'

export interface ContentVersion {
  readonly id: ChangeId
  readonly url: string
  readonly changeTarget: ChangeTarget
  readonly before: Record<string, unknown>
  readonly after: Record<string, unknown>
  /** Rendered for the approval screen. Humans review diffs, not JSON. */
  readonly diff: string
  readonly reason: string
  readonly hypothesis: string | null
  readonly actionId: string | null
  readonly agentRunId: string | null
  readonly connectorId: string
  readonly connectorRef: Record<string, unknown>
  publishStatus: PublishStatus
  publishedAt: Date | null
  rolledBackAt: Date | null
  readonly createdAt: Date
  errorMessage?: string
}

export interface ChangeRequest {
  readonly url: string
  readonly changeTarget: ChangeTarget
  readonly reason: string
  readonly hypothesis?: string
  readonly actionId?: string
  readonly agentRunId?: string
  /** The concrete edit. Exactly one field is set. */
  readonly metadata?: { title?: string; metaDescription?: string; canonical?: string; lang?: string }
  readonly content?: { heading: string; body: string }
  readonly schema?: Record<string, unknown>
  readonly newPage?: { title: string; content: string; lang?: string }
  readonly sitemapUrls?: readonly string[]
}

export interface VersionStore {
  save(version: ContentVersion): Promise<void>
  get(id: ChangeId): Promise<ContentVersion | null>
  list(url?: string): Promise<readonly ContentVersion[]>
}

/**
 * Default store. A database-backed store implements the same interface.
 *
 * Ordering uses an insertion sequence rather than `createdAt`: two changes applied in the
 * same millisecond are common in an agent run, and a history that shows them in an
 * arbitrary order is a history nobody can audit.
 */
export class InMemoryVersionStore implements VersionStore {
  private readonly versions = new Map<string, ContentVersion>()
  private readonly sequence = new Map<string, number>()
  private next = 0

  async save(version: ContentVersion): Promise<void> {
    this.versions.set(version.id, version)
    // First write wins the position, so updating a version in place keeps its slot.
    if (!this.sequence.has(version.id)) this.sequence.set(version.id, this.next++)
  }
  async get(id: ChangeId): Promise<ContentVersion | null> {
    return this.versions.get(id) ?? null
  }
  async list(url?: string): Promise<readonly ContentVersion[]> {
    const all = [...this.versions.values()].sort(
      (a, b) => (this.sequence.get(b.id) ?? 0) - (this.sequence.get(a.id) ?? 0),
    )
    return url ? all.filter((v) => v.url === url) : all
  }
}

const CAPABILITY_FOR: Record<ChangeTarget, keyof ConnectorCapabilities> = {
  METADATA: 'updateMetadata',
  CONTENT: 'updateContent',
  SCHEMA: 'updateSchema',
  PAGE: 'createPage',
  TECHNICAL: 'sitemap',
}

export interface ApplyOptions {
  readonly connector: WebsiteConnector
  readonly store: VersionStore
  readonly clock?: Clock
  /** When false, the version is recorded as awaiting approval and nothing is written. */
  readonly autoPublish: boolean
}

export const applyChange = async (
  request: ChangeRequest,
  options: ApplyOptions,
): Promise<ContentVersion> => {
  const clock = options.clock ?? systemClock
  const { connector, store } = options

  assertCapability(connector, CAPABILITY_FOR[request.changeTarget])

  const existing = request.newPage ? null : await connector.getPage(request.url)
  if (!existing && !request.newPage && request.changeTarget !== 'TECHNICAL') {
    throw new AppError({
      code: 'NOT_FOUND',
      message: `Cannot change ${request.url}: the connector does not have that page`,
    })
  }

  const before = snapshotOf(existing, request)
  const after = projectedAfter(before, request)

  const version: ContentVersion = {
    id: newId<'ChangeId'>(),
    url: request.url,
    changeTarget: request.changeTarget,
    before,
    after,
    diff: renderDiff(before, after, request.changeTarget),
    reason: request.reason,
    hypothesis: request.hypothesis ?? null,
    actionId: request.actionId ?? null,
    agentRunId: request.agentRunId ?? null,
    connectorId: connector.id,
    connectorRef: {},
    publishStatus: options.autoPublish ? 'DRAFT' : 'AWAITING_APPROVAL',
    publishedAt: null,
    rolledBackAt: null,
    createdAt: clock.now(),
  }

  // Recorded before the write: a failure mid-apply still leaves an explanation behind.
  await store.save(version)

  if (!options.autoPublish) return version

  try {
    const result = await performWrite(connector, request)
    const published: ContentVersion = {
      ...version,
      connectorRef: result.undoRef,
      publishStatus: result.published ? 'PUBLISHED' : 'DRAFT',
      publishedAt: result.published ? clock.now() : null,
    }
    await store.save(published)
    return published
  } catch (e) {
    const failed: ContentVersion = {
      ...version,
      publishStatus: 'FAILED',
      errorMessage: isAppError(e) ? e.publicMessage : 'The change could not be applied.',
    }
    await store.save(failed)
    throw e
  }
}

/** Publishes a version that was held for approval. */
export const publishApproved = async (
  versionId: ChangeId,
  request: ChangeRequest,
  options: ApplyOptions,
): Promise<ContentVersion> => {
  const clock = options.clock ?? systemClock
  const version = await options.store.get(versionId)
  if (!version) throw new AppError({ code: 'NOT_FOUND', message: `Version ${versionId}` })
  if (version.publishStatus !== 'AWAITING_APPROVAL') {
    throw new AppError({
      code: 'CONFLICT',
      message: `Version ${versionId} is ${version.publishStatus}, not awaiting approval`,
    })
  }

  const result = await performWrite(options.connector, request)
  const published: ContentVersion = {
    ...version,
    connectorRef: result.undoRef,
    publishStatus: 'PUBLISHED',
    publishedAt: clock.now(),
  }
  await options.store.save(published)
  return published
}

/**
 * Rollback.
 *
 * Restores the exact previous version and is itself recorded, so the history reads as a
 * sequence of accountable events rather than an edit that quietly disappeared.
 */
export const rollbackChange = async (
  versionId: ChangeId,
  options: Omit<ApplyOptions, 'autoPublish'>,
): Promise<ContentVersion> => {
  const clock = options.clock ?? systemClock
  const version = await options.store.get(versionId)
  if (!version) throw new AppError({ code: 'NOT_FOUND', message: `Version ${versionId}` })

  if (version.publishStatus !== 'PUBLISHED') {
    throw new AppError({
      code: 'CONFLICT',
      message: `Only a published change can be rolled back; this one is ${version.publishStatus}`,
      publicMessage: 'That change is not currently live, so there is nothing to undo.',
    })
  }

  assertCapability(options.connector, 'rollback')
  await options.connector.rollback(version.connectorRef)

  const rolledBack: ContentVersion = {
    ...version,
    publishStatus: 'ROLLED_BACK',
    rolledBackAt: clock.now(),
  }
  await options.store.save(rolledBack)
  return rolledBack
}

const performWrite = async (connector: WebsiteConnector, request: ChangeRequest) => {
  if (request.metadata) return connector.updateMetadata(request.url, request.metadata)
  if (request.content) {
    return connector.updateContent(request.url, { appendSection: request.content })
  }
  if (request.schema) return connector.updateSchema(request.url, request.schema)
  if (request.newPage) {
    return connector.createPage({ url: request.url, ...request.newPage })
  }
  if (request.sitemapUrls) return connector.updateSitemap(request.sitemapUrls)
  throw new AppError({ code: 'VALIDATION_FAILED', message: 'Change request has no operation' })
}

const snapshotOf = (
  page: Awaited<ReturnType<WebsiteConnector['getPage']>>,
  request: ChangeRequest,
): Record<string, unknown> => {
  if (!page) return { exists: false, url: request.url }
  return {
    url: page.url,
    title: page.title,
    metaDescription: page.metaDescription,
    canonical: page.canonical,
    lang: page.lang,
    content: page.content,
    structuredData: page.structuredData,
  }
}

const projectedAfter = (
  before: Record<string, unknown>,
  request: ChangeRequest,
): Record<string, unknown> => {
  const after = { ...before }
  if (request.metadata) Object.assign(after, request.metadata)
  if (request.content) {
    after.content = `${String(before.content ?? '')}\n[${request.content.heading}] ${request.content.body}`
  }
  if (request.schema) {
    const existing = Array.isArray(before.structuredData) ? before.structuredData : []
    after.structuredData = [
      ...existing.filter(
        (s) => (s as Record<string, unknown>)['@type'] !== request.schema!['@type'],
      ),
      request.schema,
    ]
  }
  if (request.newPage) {
    after.exists = true
    after.title = request.newPage.title
    after.content = request.newPage.content
  }
  if (request.sitemapUrls) after.sitemapUrls = [...request.sitemapUrls]
  return after
}

const renderDiff = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  target: ChangeTarget,
): string => {
  const render = (record: Record<string, unknown>): string => {
    const keys = target === 'METADATA' ? ['title', 'metaDescription', 'canonical', 'lang'] : Object.keys(record)
    return keys
      .filter((k) => record[k] !== undefined)
      .map((k) => `${k}: ${stringify(record[k])}`)
      .join('\n')
  }
  return unifiedDiff(render(before), render(after), target.toLowerCase())
}

const stringify = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value, null, 2)
