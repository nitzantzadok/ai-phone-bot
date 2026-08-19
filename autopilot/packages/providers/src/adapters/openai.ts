/**
 * OpenAI adapter (ChatGPT family).
 *
 * Uses the Responses API with the official `web_search` tool. URL citations come back as
 * `url_citation` annotations on the output text.
 */
import OpenAI from 'openai'
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

export interface OpenAIProviderOptions extends BaseProviderOptions {
  readonly apiKey: string
  readonly baseURL?: string
}

export class OpenAIProvider extends BaseProvider {
  readonly id: ProviderId = 'openai'
  readonly capabilities: ProviderCapabilities = {
    search: true,
    structuredOutput: true,
    maxContextTokens: 400_000,
  }

  private readonly client: OpenAI

  constructor(options: OpenAIProviderOptions) {
    super(options)
    this.client = new OpenAI({
      apiKey: options.apiKey,
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
      maxRetries: 0,
    })
  }

  protected async callGenerate(
    req: GenerateRequest,
    spec: ModelSpec,
    signal: AbortSignal,
  ): Promise<RawProviderResult> {
    const response = await this.client.responses.create(
      {
        model: spec.model,
        input: req.prompt,
        ...(req.system ? { instructions: req.system } : {}),
        ...(req.maxOutputTokens ? { max_output_tokens: req.maxOutputTokens } : {}),
        ...(req.search
          ? {
              tools: [
                {
                  type: 'web_search' as const,
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

    return this.mapResponse(response)
  }

  protected async callStructured<T>(
    req: StructuredRequest<T>,
    spec: ModelSpec,
    signal: AbortSignal,
  ): Promise<RawProviderResult & { value: T }> {
    const jsonSchema = z.toJSONSchema(req.schema, { io: 'output' }) as Record<string, unknown>
    const response = await this.client.responses.create(
      {
        model: spec.model,
        input: req.prompt,
        ...(req.system ? { instructions: req.system } : {}),
        ...(req.maxOutputTokens ? { max_output_tokens: req.maxOutputTokens } : {}),
        text: {
          format: {
            type: 'json_schema' as const,
            name: req.schemaName,
            schema: jsonSchema as never,
            strict: false,
          },
        },
      },
      { signal },
    )

    const mapped = this.mapResponse(response)
    if (!mapped.text) {
      throw new AppError({
        code: 'PROVIDER_ERROR',
        message: 'OpenAI returned an empty structured response',
        retryable: true,
      })
    }
    return { ...mapped, value: req.schema.parse(JSON.parse(mapped.text)) }
  }

  private mapResponse(response: OpenAI.Responses.Response): RawProviderResult {
    const citations: ProviderCitation[] = []
    const searchQueries: string[] = []

    for (const item of response.output ?? []) {
      if (item.type === 'message') {
        for (const content of item.content) {
          if (content.type === 'output_text') {
            for (const annotation of content.annotations ?? []) {
              if (annotation.type === 'url_citation') {
                citations.push({
                  url: annotation.url,
                  title: annotation.title,
                  position: citations.length + 1,
                })
              }
            }
          }
        }
      } else if (item.type === 'web_search_call') {
        const query = (item.action as { query?: string } | undefined)?.query
        if (query) searchQueries.push(query)
      }
    }

    return {
      text: response.output_text ?? '',
      citations,
      searchQueries,
      usage: {
        promptTokens: response.usage?.input_tokens ?? 0,
        completionTokens: response.usage?.output_tokens ?? 0,
        searchCount: searchQueries.length,
      },
      finishReason: response.status ?? undefined,
    }
  }
}
