/**
 * Statistics used by AIRS confidence and by the experiment engine.
 *
 * The product makes claims about whether a business improved. Those claims are only worth
 * making if the arithmetic behind them is honest about sample size — 1/2 prompts is not
 * "50% recommendation rate" with any useful confidence.
 */

/** Standard normal quantile (Acklam's inverse-CDF approximation), |error| < 1.15e-9. */
export const normalQuantile = (p: number): number => {
  if (p <= 0 || p >= 1) throw new Error(`normalQuantile requires 0 < p < 1, got ${p}`)
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const pLow = 0.02425
  const pHigh = 1 - pLow
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  }
  if (p > pHigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  }
  const q = p - 0.5
  const r = q * q
  return (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
}

/** Two-tailed standard normal CDF tail probability. */
export const normalCdf = (z: number): number => {
  // Abramowitz & Stegun 7.1.26 via erf.
  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x)
  return 0.5 * (1 + sign * y)
}

export interface Interval {
  readonly lower: number
  readonly upper: number
}

/**
 * Wilson score interval for a binomial proportion. Preferred over the normal approximation
 * because it behaves sanely at the small n and extreme p this product routinely sees
 * (e.g. recommended in 0 of 12 prompts).
 */
export const wilsonInterval = (successes: number, trials: number, confidence = 0.95): Interval => {
  if (trials <= 0) return { lower: 0, upper: 1 }
  const z = normalQuantile(1 - (1 - confidence) / 2)
  const p = successes / trials
  const denom = 1 + (z * z) / trials
  const centre = p + (z * z) / (2 * trials)
  const margin = z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials))
  return {
    lower: Math.max(0, (centre - margin) / denom),
    upper: Math.min(1, (centre + margin) / denom),
  }
}

/**
 * Two-proportion z-test. Returns the p-value for "these two rates differ".
 * The experiment engine uses this to decide whether it is allowed to use causal-sounding
 * language at all (brief §53).
 */
export const twoProportionPValue = (
  successesA: number,
  trialsA: number,
  successesB: number,
  trialsB: number,
): number => {
  if (trialsA === 0 || trialsB === 0) return 1
  const pA = successesA / trialsA
  const pB = successesB / trialsB
  const pooled = (successesA + successesB) / (trialsA + trialsB)
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / trialsA + 1 / trialsB))
  if (se === 0) return 1
  const z = (pB - pA) / se
  return 2 * (1 - normalCdf(Math.abs(z)))
}

/** Sample size at which a proportion estimate becomes worth reporting at all. */
export const MIN_REPORTABLE_TRIALS = 8

export const proportionConfidence = (
  successes: number,
  trials: number,
): { rate: number; interval: Interval; confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN' } => {
  if (trials === 0) {
    return { rate: 0, interval: { lower: 0, upper: 1 }, confidence: 'UNKNOWN' }
  }
  const interval = wilsonInterval(successes, trials)
  const width = interval.upper - interval.lower
  const confidence =
    trials < MIN_REPORTABLE_TRIALS ? 'LOW' : width < 0.15 ? 'HIGH' : width < 0.3 ? 'MEDIUM' : 'LOW'
  return { rate: successes / trials, interval, confidence }
}

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

export const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length

export const round = (value: number, digits = 2): number => {
  const f = 10 ** digits
  return Math.round(value * f) / f
}
