import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FixedClock } from '@autopilot/shared/clock.ts'
import { assertCapability } from '../src/connector.ts'
import { MemoryConnector } from '../src/connectors/memory.ts'
import { GenericConnector } from '../src/connectors/generic.ts'
import { WordPressConnector } from '../src/connectors/wordpress.ts'
import {
  InMemoryVersionStore,
  applyChange,
  publishApproved,
  rollbackChange,
  type ChangeRequest,
} from '../src/versioning.ts'

const HOME = 'https://rosa.example.com/'

const connector = () =>
  new MemoryConnector([
    {
      url: HOME,
      title: 'Rosa',
      metaDescription: null,
      lang: null,
      canonical: null,
      content: '<p>Italian food in Tel Aviv.</p>',
      structuredData: [],
    },
    { url: 'https://rosa.example.com/menu', title: 'Menu', content: '<p>Pasta.</p>' },
  ])

const clock = () => new FixedClock(new Date('2026-08-19T10:00:00Z'))

describe('connector capabilities', () => {
  it('refuses an operation the platform does not support, in plain language', () => {
    const generic = new GenericConnector(HOME)
    expect(() => assertCapability(generic, 'updateContent')).toThrow(/cannot updateContent/)
    try {
      assertCapability(generic, 'updateContent')
    } catch (e) {
      expect((e as { publicMessage: string }).publicMessage).toContain('does not support that change')
    }
  })

  it('read-only connectors reject writes rather than silently doing nothing', async () => {
    const generic = new GenericConnector(HOME)
    await expect(generic.updateMetadata(HOME, { title: 'x' })).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    })
    await expect(generic.rollback({})).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' })
  })
})

describe('MemoryConnector', () => {
  it('applies and reverses a metadata change exactly', async () => {
    const site = connector()
    const before = await site.getPage(HOME)
    const result = await site.updateMetadata(HOME, {
      title: 'Rosa - Italian restaurant in Tel Aviv',
      metaDescription: 'Handmade pasta in central Tel Aviv.',
    })

    const after = await site.getPage(HOME)
    expect(after!.title).toBe('Rosa - Italian restaurant in Tel Aviv')

    await site.rollback(result.undoRef)
    const restored = await site.getPage(HOME)
    expect(restored!.title).toBe(before!.title)
    expect(restored!.metaDescription).toBe(before!.metaDescription)
  })

  it('appends a content section and can undo it', async () => {
    const site = connector()
    const original = (await site.getPage(HOME))!.content
    const result = await site.updateContent(HOME, {
      appendSection: { heading: 'Date night', body: 'A quiet room for two.' },
    })

    expect((await site.getPage(HOME))!.content).toContain('Date night')
    await site.rollback(result.undoRef)
    expect((await site.getPage(HOME))!.content).toBe(original)
  })

  it('replaces schema of the same type instead of accumulating duplicates', async () => {
    const site = connector()
    await site.updateSchema(HOME, { '@type': 'Restaurant', name: 'Rosa' })
    await site.updateSchema(HOME, { '@type': 'Restaurant', name: 'Rosa', telephone: '03-1234567' })
    const page = await site.getPage(HOME)
    expect(page!.structuredData).toHaveLength(1)
    expect(page!.structuredData[0]!.telephone).toBe('03-1234567')
  })

  it('removes a created page on rollback', async () => {
    const site = connector()
    const result = await site.createPage({
      url: 'https://rosa.example.com/faq',
      title: 'FAQ',
      content: '<p>Questions.</p>',
    })
    expect(await site.getPage('https://rosa.example.com/faq')).not.toBeNull()
    await site.rollback(result.undoRef)
    expect(await site.getPage('https://rosa.example.com/faq')).toBeNull()
  })

  it('restores the previous sitemap on rollback', async () => {
    const site = connector()
    await site.updateSitemap([HOME])
    const second = await site.updateSitemap([HOME, 'https://rosa.example.com/menu'])
    expect(site.sitemap).toHaveLength(2)
    await site.rollback(second.undoRef)
    expect(site.sitemap).toEqual([HOME])
  })

  it('rejects a change to a page that does not exist', async () => {
    await expect(connector().updateMetadata('https://rosa.example.com/nope', { title: 'x' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects an unknown undo reference rather than silently succeeding', async () => {
    await expect(connector().rollback({ id: 'made-up' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('change versioning', () => {
  let store: InMemoryVersionStore
  let site: MemoryConnector

  beforeEach(() => {
    store = new InMemoryVersionStore()
    site = connector()
  })

  const metadataChange: ChangeRequest = {
    url: HOME,
    changeTarget: 'METADATA',
    reason: 'Your home page has no summary for AI systems to read.',
    hypothesis: 'A clear title and summary will improve entity recognition.',
    metadata: {
      title: 'Rosa - Italian restaurant in Tel Aviv',
      metaDescription: 'Handmade pasta in central Tel Aviv.',
    },
  }

  it('records before, after and a readable diff for every change', async () => {
    const version = await applyChange(metadataChange, {
      connector: site,
      store,
      clock: clock(),
      autoPublish: true,
    })

    expect(version.publishStatus).toBe('PUBLISHED')
    expect(version.before.title).toBe('Rosa')
    expect(version.after.title).toBe('Rosa - Italian restaurant in Tel Aviv')
    expect(version.diff).toContain('-title: Rosa')
    expect(version.diff).toContain('+title: Rosa - Italian restaurant in Tel Aviv')
    expect(version.reason).toContain('no summary')
    expect(version.publishedAt).toEqual(new Date('2026-08-19T10:00:00Z'))
  })

  it('holds a change for approval without touching the site', async () => {
    const version = await applyChange(metadataChange, {
      connector: site,
      store,
      autoPublish: false,
    })

    expect(version.publishStatus).toBe('AWAITING_APPROVAL')
    expect(version.publishedAt).toBeNull()
    expect((await site.getPage(HOME))!.title).toBe('Rosa')
    // The diff is still available, so the customer can see exactly what was proposed.
    expect(version.diff).toContain('Italian restaurant in Tel Aviv')
  })

  it('publishes an approved change', async () => {
    const held = await applyChange(metadataChange, { connector: site, store, autoPublish: false })
    const published = await publishApproved(held.id, metadataChange, {
      connector: site,
      store,
      autoPublish: true,
    })
    expect(published.publishStatus).toBe('PUBLISHED')
    expect((await site.getPage(HOME))!.title).toBe('Rosa - Italian restaurant in Tel Aviv')
  })

  it('refuses to publish the same held change twice', async () => {
    const held = await applyChange(metadataChange, { connector: site, store, autoPublish: false })
    await publishApproved(held.id, metadataChange, { connector: site, store, autoPublish: true })
    await expect(
      publishApproved(held.id, metadataChange, { connector: site, store, autoPublish: true }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('restores the exact previous state on rollback', async () => {
    const original = await site.getPage(HOME)
    const version = await applyChange(metadataChange, {
      connector: site,
      store,
      autoPublish: true,
    })

    const rolledBack = await rollbackChange(version.id, { connector: site, store, clock: clock() })
    expect(rolledBack.publishStatus).toBe('ROLLED_BACK')
    expect(rolledBack.rolledBackAt).not.toBeNull()

    const restored = await site.getPage(HOME)
    expect(restored!.title).toBe(original!.title)
    expect(restored!.metaDescription).toBe(original!.metaDescription)
  })

  it('refuses to roll back something that was never published', async () => {
    const held = await applyChange(metadataChange, { connector: site, store, autoPublish: false })
    await expect(rollbackChange(held.id, { connector: site, store })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('records a failed change instead of losing it', async () => {
    const failing = new MemoryConnector([{ url: HOME, title: 'Rosa' }])
    vi.spyOn(failing, 'updateMetadata').mockRejectedValue(new Error('connector exploded'))

    await expect(
      applyChange(metadataChange, { connector: failing, store, autoPublish: true }),
    ).rejects.toThrow()

    const versions = await store.list(HOME)
    expect(versions).toHaveLength(1)
    expect(versions[0]!.publishStatus).toBe('FAILED')
    expect(versions[0]!.before.title).toBe('Rosa')
  })

  it('refuses a change the connector cannot make', async () => {
    const generic = new GenericConnector(HOME)
    await expect(
      applyChange(metadataChange, { connector: generic, store, autoPublish: true }),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' })
  })

  it('keeps a full history per URL, newest first', async () => {
    await applyChange(metadataChange, { connector: site, store, autoPublish: true })
    await applyChange(
      {
        ...metadataChange,
        metadata: { title: 'Rosa - Tel Aviv' },
        reason: 'Shorten the title.',
      },
      { connector: site, store, autoPublish: true },
    )
    const history = await store.list(HOME)
    expect(history).toHaveLength(2)
    expect(history[0]!.after.title).toBe('Rosa - Tel Aviv')
  })

  it('versions a content addition with its hypothesis attached', async () => {
    const version = await applyChange(
      {
        url: HOME,
        changeTarget: 'CONTENT',
        reason: 'Customers ask for date-night restaurants and your site never says you suit that.',
        hypothesis: 'Stating the date-night use case will improve visibility for those prompts.',
        content: { heading: 'Date night', body: 'A quiet room for two in central Tel Aviv.' },
      },
      { connector: site, store, autoPublish: true },
    )
    expect(version.hypothesis).toContain('date-night')
    expect((await site.getPage(HOME))!.content).toContain('Date night')
  })
})

describe('WordPressConnector', () => {
  const post = {
    id: 12,
    link: 'https://rosa.co.il/about',
    type: 'page',
    title: { rendered: 'About', raw: 'About' },
    excerpt: { rendered: '', raw: '' },
    content: { rendered: '<p>Old</p>', raw: '<p>Old</p>' },
  }

  /** Stub resolver: keeps these tests hermetic and off the network. */
  const dnsResolver = (async (hostname: string) => {
    if (hostname === 'rosa.co.il') return [{ address: '93.184.216.34', family: 4 }]
    throw new Error(`ENOTFOUND ${hostname}`)
    // oxlint-disable-next-line no-explicit-any
  }) as any

  const fetchImpl = (handler: (url: string, init?: RequestInit) => unknown) =>
    (async (url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => handler(url, init),
    })) as unknown as typeof fetch

  it('declares that it cannot inject schema, rather than pretending', () => {
    const wp = new WordPressConnector({
      siteUrl: 'https://rosa.co.il',
      username: 'u',
      applicationPassword: 'p',
    })
    expect(wp.capabilities.updateSchema).toBe(false)
    expect(wp.capabilities.updateContent).toBe(true)
  })

  it('authenticates with an application password and never a login password', async () => {
    let seenAuth: string | undefined
    const wp = new WordPressConnector({
      siteUrl: 'https://rosa.co.il',
      username: 'rosa',
      applicationPassword: 'abcd efgh ijkl',
      dnsResolver,
      fetchImpl: (async (url: string, init?: RequestInit) => {
        seenAuth = (init?.headers as Record<string, string> | undefined)?.authorization
        return { ok: true, status: 200, json: async () => [post] }
      }) as unknown as typeof fetch,
    })

    await wp.listPages()
    expect(seenAuth).toBe(`Basic ${Buffer.from('rosa:abcd efgh ijkl').toString('base64')}`)
  })

  it('creates new pages as drafts, never live', async () => {
    let body: Record<string, unknown> | undefined
    const wp = new WordPressConnector({
      siteUrl: 'https://rosa.co.il',
      username: 'u',
      applicationPassword: 'p',
      dnsResolver,
      fetchImpl: fetchImpl((_url, init) => {
        body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        return { ...post, id: 99, link: 'https://rosa.co.il/faq' }
      }),
    })

    const result = await wp.createPage({
      url: 'https://rosa.co.il/faq',
      title: 'FAQ',
      content: '<p>Questions</p>',
    })
    expect(body!.status).toBe('draft')
    expect(result.published).toBe(false)
  })

  it('escapes content it appends, so a section cannot inject markup', async () => {
    let body: Record<string, unknown> | undefined
    const wp = new WordPressConnector({
      siteUrl: 'https://rosa.co.il',
      username: 'u',
      applicationPassword: 'p',
      dnsResolver,
      fetchImpl: fetchImpl((url, init) => {
        if (url.includes('/pages/12')) {
          body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
          return post
        }
        return url.includes('/pages') ? [post] : []
      }),
    })

    await wp.updateContent('https://rosa.co.il/about', {
      appendSection: { heading: '<script>alert(1)</script>', body: 'Safe & sound' },
    })
    expect(String(body!.content)).not.toContain('<script>')
    expect(String(body!.content)).toContain('&lt;script&gt;')
    expect(String(body!.content)).toContain('Safe &amp; sound')
  })

  it('refuses to talk to a site URL that fails SSRF validation', async () => {
    const wp = new WordPressConnector({
      siteUrl: 'http://127.0.0.1',
      username: 'u',
      applicationPassword: 'p',
      dnsResolver,
      fetchImpl: fetchImpl(() => []),
    })
    await expect(wp.listPages()).rejects.toMatchObject({ code: 'UNSAFE_URL' })
  })

  it('surfaces an authentication failure as a reconnect prompt, not a stack trace', async () => {
    const wp = new WordPressConnector({
      siteUrl: 'https://rosa.co.il',
      username: 'u',
      applicationPassword: 'wrong',
      dnsResolver,
      fetchImpl: (async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch,
    })
    await expect(wp.listPages()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    try {
      await wp.listPages()
    } catch (e) {
      expect((e as { publicMessage: string }).publicMessage).toContain('reconnect')
    }
  })
})
