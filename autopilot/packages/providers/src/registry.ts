/**
 * Provider registry.
 *
 * One place decides whether the system talks to real engines or to the simulator, based on
 * configuration rather than on scattered `if (process.env.X)` checks. `USE_MOCK_PROVIDERS`
 * or a missing key means the whole product still runs — degraded to a labelled simulation,
 * never silently half-working.
 */
import type { Env } from '@autopilot/shared/env.ts'
import type { Logger } from '@autopilot/shared/logger.ts'
import { noopLogger } from '@autopilot/shared/logger.ts'
import type { ProviderId } from '@autopilot/shared/domain.ts'
import type { CostLedger } from './cost.ts'
import { AnthropicProvider } from './adapters/anthropic.ts'
import { GeminiProvider } from './adapters/gemini.ts'
import { OpenAIProvider } from './adapters/openai.ts'
import { MockAIProvider, type MockProviderOptions } from './adapters/mock.ts'
import { ModelRouter, type ModelRouterOptions } from './router.ts'
import type { AIProvider } from './types.ts'

export interface RegistryOptions {
  readonly env: Env
  readonly ledger?: CostLedger
  readonly logger?: Logger
  /** Required when mocks are in use; defines the simulated world. */
  readonly mock?: MockProviderOptions
  readonly routerOptions?: Omit<ModelRouterOptions, 'ledger' | 'logger'>
}

export interface ProviderRegistry {
  readonly providers: ReadonlyMap<ProviderId, AIProvider>
  readonly router: ModelRouter
  /** True when every provider in the registry is a simulation. */
  readonly simulated: boolean
  healthCheckAll(): Promise<Record<string, boolean>>
}

export const createProviderRegistry = (options: RegistryOptions): ProviderRegistry => {
  const { env, ledger, mock } = options
  const logger = options.logger ?? noopLogger
  const providers = new Map<ProviderId, AIProvider>()

  const useMocks = env.USE_MOCK_PROVIDERS || (!env.OPENAI_API_KEY && !env.GEMINI_API_KEY && !env.ANTHROPIC_API_KEY)

  if (useMocks) {
    if (!mock) {
      throw new Error(
        'Mock providers requested but no MockProviderOptions supplied. Refusing to start ' +
          'with providers that would invent data.',
      )
    }
    for (const id of ['openai', 'gemini', 'anthropic'] as const) {
      providers.set(id, new MockAIProvider(id, mock))
    }
    logger.warn('using simulated providers; results are SYNTHETIC and not customer-facing')
  } else {
    const base = { ledger, logger }
    if (env.OPENAI_API_KEY) {
      providers.set('openai', new OpenAIProvider({ ...base, apiKey: env.OPENAI_API_KEY }))
    }
    if (env.GEMINI_API_KEY) {
      providers.set('gemini', new GeminiProvider({ ...base, apiKey: env.GEMINI_API_KEY }))
    }
    if (env.ANTHROPIC_API_KEY) {
      providers.set('anthropic', new AnthropicProvider({ ...base, apiKey: env.ANTHROPIC_API_KEY }))
    }
  }

  const router = new ModelRouter(providers, { ...options.routerOptions, ledger, logger })

  return {
    providers,
    router,
    simulated: [...providers.values()].every((p) => p.simulated),
    healthCheckAll: async () => {
      const entries = await Promise.all(
        [...providers.entries()].map(async ([id, p]) => {
          const health = await p.healthCheck()
          return [id, health.healthy] as const
        }),
      )
      return Object.fromEntries(entries)
    },
  }
}
