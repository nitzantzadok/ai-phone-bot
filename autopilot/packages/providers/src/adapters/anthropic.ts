/**
 * Anthropic adapter (Claude).
 *
 * Uses the Messages API and the official server-side `web_search` tool for grounded
 * measurement. Citations arrive as `web_search_result_location` blocks attached to text,
 * which is exactly the provenance the evidence graph needs.
 */
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { AppError } from '@autopilot/shared/errors.ts'
import type { ProviderId } from '@autopilot/shared/domain.ts'
import type { ModelSpec } from '../pricing.ts'
import type {
  GenerateRequest,
  ProviderCapabilities,
  ProviderCitation,
  StructuredRequest,
} from '../types.ts'
import { BaseProvider, type BaseProviderOptions, type RawProviderResult } from './base.ts'

/**
 * Dated tool versions are pinned deliberately: a silent upgrade would change measurement
 * behaviour mid-experiment and invalidate before/after comparisons.
 */
const WEB_SEARCH_TOOL_TYPE = 'web_search_20260318' as const

export interface AnthropicProviderOptions extends BaseProviderOptions {
  readonly apiKey: string
  readonly baseURL?: string
}

export class AnthropicProvider extends BaseProvider {
  readonly id: ProviderId = 'anthropic'
  readonly capabilities: ProviderCapabilities = {
    search: true,
    structuredOutput: true,
    maxContextTokens: 200_000,
  }

  private readonly client: Anthropic

  constructor(options: AnthropicProviderOptions) {
    super(options)
    this.client = new Anthropic({
      apiKey: options.apiKey,
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
      maxRetries: 0, // retry policy is owned by BaseProvider, not the SDK
    })
  }

  protected async callGenerate(
    req: GenerateRequest,
    spec: ModelSpec,
    signal: AbortSignal,
  ): Promise<RawProviderResult> {
    const message = await this.client.messages.create(
      {
        model: spec.model,
        max_tokens: req.maxOutputTokens ?? 1024,
        temperature: req.temperature ?? 0.2,
        ...(req.system ? { system: req.system } : {}),
        messages: [{ role: 'user', content: req.prompt }],
        ...(req.search
          ? {
              tools: [
                {
                  type: WEB_SEARCH_TOOL_TYPE,
                  name: 'web_search' as const,
                  max_uses: 4,
                  ...(req.context?.city
                    ? {
                        user_location: {
                          type: 'approximate' as const,
                          city: req.context.city,
                          country: req.context.country,
                          timezone: req.context.timezone,
                        },
                      }
                    : {}),
                },
              ],
            }
          : {}),
      },
      { signal },
    )

    return this.mapMessage(message)
  }

  protected async callStructured<T>(
    req: StructuredRequest<T>,
    spec: ModelSpec,
    signal: AbortSignal,
  ): Promise<RawProviderResult & { value: T }> {
    // A single-tool forced call is the most reliable way to get schema-shaped output.
    const jsonSchema = z.toJSONSchema(req.schema, { io: 'output' }) as Record<string, unknown>
    const message = await this.client.messages.create(
      {
        model: spec.model,
        max_tokens: req.maxOutputTokens ?? 2048,
        temperature: req.temperature ?? 0,
        ...(req.system ? { system: req.system } : {}),
        messages: [{ role: 'user', content: req.prompt }],
        tools: [
          {
            name: req.schemaName,
            description: `Return the result as ${req.schemaName}.`,
            input_schema: jsonSchema as never,
          },
        ],
        tool_choice: { type: 'tool', name: req.schemaName },
      },
      { signal },
    )

    const toolUse = message.content.find((b) => b.type === 'tool_use')
    if (!toolUse) {
      throw new AppError({
        code: 'PROVIDER_ERROR',
        message: 'Anthropic returned no structured tool call',
        retryable: true,
      })
    }
    const mapped = this.mapMessage(message)
    return { ...mapped, value: req.schema.parse(toolUse.input) }
  }

  private mapMessage(message: Anthropic.Message): RawProviderResult {
    const citations: ProviderCitation[] = []
    const texts: string[] = []
    const searchQueries: string[] = []

    for (const block of message.content) {
      if (block.type === 'text') {
        texts.push(block.text)
        for (const c of block.citations ?? []) {
          if (c.type === 'web_search_result_location') {
            citations.push({
              url: c.url,
              title: c.title ?? undefined,
              snippet: c.cited_text,
              position: citations.length + 1,
            })
          }
        }
      } else if (block.type === 'server_tool_use' && block.name === 'web_search') {
        const query = (block.input as { query?: string } | undefined)?.query
        if (query) searchQueries.push(query)
      }
    }

    return {
      text: texts.join('\n').trim(),
      citations,
      searchQueries,
      usage: {
        promptTokens: message.usage.input_tokens,
        completionTokens: message.usage.output_tokens,
        searchCount: message.usage.server_tool_use?.web_search_requests ?? 0,
      },
      finishReason: message.stop_reason ?? undefined,
    }
  }
}
