/**
 * Google Gemini adapter.
 *
 * Uses the official Google Search grounding tool. Grounding metadata gives us both the
 * search queries the model issued and the web chunks it grounded on — the richest
 * provenance of the three providers, and the reason Gemini is the default search tier.
 */
import { GoogleGenAI } from '@google/genai'
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

export interface GeminiProviderOptions extends BaseProviderOptions {
  readonly apiKey: string
}

export class GeminiProvider extends BaseProvider {
  readonly id: ProviderId = 'gemini'
  readonly capabilities: ProviderCapabilities = {
    search: true,
    structuredOutput: true,
    maxContextTokens: 1_000_000,
  }

  private readonly client: GoogleGenAI

  constructor(options: GeminiProviderOptions) {
    super(options)
    this.client = new GoogleGenAI({ apiKey: options.apiKey })
  }

  protected async callGenerate(
    req: GenerateRequest,
    spec: ModelSpec,
    signal: AbortSignal,
  ): Promise<RawProviderResult> {
    const response = await this.client.models.generateContent({
      model: spec.model,
      contents: req.prompt,
      config: {
        abortSignal: signal,
        temperature: req.temperature ?? 0.2,
        ...(req.system ? { systemInstruction: req.system } : {}),
        ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}),
        // Grounding is the officially supported path; we never emulate a consumer UI.
        ...(req.search ? { tools: [{ googleSearch: {} }] } : {}),
      },
    })

    return this.mapResponse(response, req.search === true)
  }

  protected async callStructured<T>(
    req: StructuredRequest<T>,
    spec: ModelSpec,
    signal: AbortSignal,
  ): Promise<RawProviderResult & { value: T }> {
    const jsonSchema = z.toJSONSchema(req.schema, { io: 'output' }) as Record<string, unknown>
    const response = await this.client.models.generateContent({
      model: spec.model,
      contents: req.prompt,
      config: {
        abortSignal: signal,
        temperature: req.temperature ?? 0,
        ...(req.system ? { systemInstruction: req.system } : {}),
        responseMimeType: 'application/json',
        responseJsonSchema: jsonSchema,
      },
    })

    const mapped = this.mapResponse(response, false)
    if (!mapped.text) {
      throw new AppError({
        code: 'PROVIDER_ERROR',
        message: 'Gemini returned an empty structured response',
        retryable: true,
      })
    }
    return { ...mapped, value: req.schema.parse(JSON.parse(mapped.text)) }
  }

  private mapResponse(
    response: Awaited<ReturnType<GoogleGenAI['models']['generateContent']>>,
    searched: boolean,
  ): RawProviderResult {
    const candidate = response.candidates?.[0]
    const grounding = candidate?.groundingMetadata
    const citations: ProviderCitation[] = (grounding?.groundingChunks ?? [])
      .map((chunk, index): ProviderCitation | null => {
        const uri = chunk.web?.uri
        if (!uri) return null
        return { url: uri, title: chunk.web?.title, position: index + 1 }
      })
      .filter((c): c is ProviderCitation => c !== null)

    const searchQueries = grounding?.webSearchQueries ?? []

    return {
      text: response.text ?? '',
      citations,
      searchQueries,
      usage: {
        promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        searchCount: searched ? Math.max(1, searchQueries.length) : 0,
      },
      finishReason: candidate?.finishReason,
    }
  }
}
