/**
 * Identifiers.
 *
 * UUID v7 everywhere: globally unique like v4 but time-ordered, which keeps B-tree index
 * locality good for the high-write tables (prompt_executions, ai_responses, api_cost_records)
 * that dominate this product's write volume.
 *
 * Branded types make it a compile error to pass a BusinessId where an OrganizationId is
 * expected — cheap insurance in a codebase where almost everything takes several ids.
 */
import { randomUUID, randomBytes } from 'node:crypto'

declare const brand: unique symbol
type Brand<T, B extends string> = T & { readonly [brand]: B }

export type OrganizationId = Brand<string, 'OrganizationId'>
export type UserId = Brand<string, 'UserId'>
export type BusinessId = Brand<string, 'BusinessId'>
export type PromptId = Brand<string, 'PromptId'>
export type PromptSetId = Brand<string, 'PromptSetId'>
export type ExecutionId = Brand<string, 'ExecutionId'>
export type FactId = Brand<string, 'FactId'>
export type SourceId = Brand<string, 'SourceId'>
export type CompetitorId = Brand<string, 'CompetitorId'>
export type OpportunityId = Brand<string, 'OpportunityId'>
export type AgentRunId = Brand<string, 'AgentRunId'>
export type ExperimentId = Brand<string, 'ExperimentId'>
export type ChangeId = Brand<string, 'ChangeId'>
export type JobId = Brand<string, 'JobId'>

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_ANY_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** RFC 9562 UUIDv7: 48-bit big-endian unix ms, version, then randomness. */
export const uuidv7 = (now: number = Date.now()): string => {
  const bytes = randomBytes(16)
  const ts = BigInt(now)
  bytes[0] = Number((ts >> 40n) & 0xffn)
  bytes[1] = Number((ts >> 32n) & 0xffn)
  bytes[2] = Number((ts >> 24n) & 0xffn)
  bytes[3] = Number((ts >> 16n) & 0xffn)
  bytes[4] = Number((ts >> 8n) & 0xffn)
  bytes[5] = Number(ts & 0xffn)
  bytes[6] = (bytes[6]! & 0x0f) | 0x70 // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // RFC 4122 variant
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const newId = <T extends string>(): Brand<string, T> => uuidv7() as Brand<string, T>

export const isUuid = (v: string): boolean => UUID_ANY_RE.test(v)
export const isUuidV7 = (v: string): boolean => UUID_V7_RE.test(v)

/** Extract the embedded timestamp from a v7 id — useful in admin tooling and forensics. */
export const uuidV7Timestamp = (id: string): Date | null => {
  if (!isUuidV7(id)) return null
  const hex = id.replace(/-/g, '').slice(0, 12)
  return new Date(Number.parseInt(hex, 16))
}

/** Opaque, URL-safe token for share links and webhook secrets. Not an identifier of a row. */
export const secureToken = (bytes = 32): string => randomBytes(bytes).toString('base64url')

export const randomUuidV4 = (): string => randomUUID()
