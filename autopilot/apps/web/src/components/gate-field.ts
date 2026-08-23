/**
 * The entrance, as arithmetic.
 *
 * The sequence is the product's own story rather than a generic reveal: a field of
 * scattered sources; a question going out; the sources it touches lighting up and finding
 * each other; all of it collapsing into a single answer; the name resolving out of the
 * collapse. That is, in pictures, exactly what the product measures.
 *
 * Seven acts on ONE clock. Every visual — particles, edges, the query front, the flash, and
 * the wordmark's opacity, blur and chromatic split — is a function of a single phase value
 * derived from one timestamp. Nothing is a CSS keyframe, so nothing can drift out of step
 * with anything else: the flash can never land before the collapse it belongs to.
 *
 * This module holds no DOM and no React. It is the whole animation as pure functions plus
 * one `paint`, which means the timeline can be tested — that the acts overlap where they
 * are meant to, that the field is deterministic, that the light is fully handed over by the
 * end — without a browser.
 */

/** A window on the clock: start and end, in milliseconds. */
export type Act = readonly [number, number]

/** One entrance, start to finish, in milliseconds. */
export const GATE_DURATION = 6600

/**
 * The acts, deliberately overlapping.
 *
 * A sequence whose parts start only after the previous part has finished reads as a list of
 * effects. These are cross-faded — the weave begins while the query is still travelling,
 * the name starts resolving while the collapse is still arriving — which is what makes it
 * read as one continuous event rather than five.
 */
export const ACTS = {
  /** The field fades up out of black. */
  wake: [0, 700],
  /** The question goes out; sources ignite as it reaches them. */
  pulse: [700, 2300],
  /** Edges draw between sources that found each other. */
  weave: [1600, 2900],
  /** Everything falls inward, trailing. */
  collapse: [2800, 4050],
  /** The name comes out of it. */
  resolve: [3950, 4800],
  /** Long enough to read, short enough not to be a toll. */
  hold: [4800, 5900],
  /** The cover lifts off the page. */
  release: [5900, 6600],
} as const satisfies Record<string, Act>

const clamp = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** Progress through an act, clamped 0..1. */
export const span = (t: number, [a, b]: Act) => clamp((t - a) / (b - a))

/** The product's easing as a function: a firm settle, no overshoot. */
export const settle = (p: number) => 1 - Math.pow(1 - p, 3.2)

export const easeIn = (p: number) => p * p * p

/** Smoothstep between two thresholds — used to give a phase a soft shoulder. */
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

export const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
  const n = Number.parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export type FieldNode = {
  /** Position on the unit disc, before projection. */
  x: number
  y: number
  /** Depth. Larger is further away. */
  z: number
  /** Radius before perspective. */
  r: number
  /** Phase offset, so nothing in the field breathes in unison. */
  ph: number
  /** Drift speed. */
  sp: number
  /** Distance from the centre — what the query front is compared against. */
  d: number
}

export type Field = {
  nodes: readonly FieldNode[]
  edges: readonly (readonly [number, number])[]
}

/**
 * The field, and the graph over it.
 *
 * Two decisions are load-bearing.
 *
 * Points are distributed in a **disc**, not a square, so that a collapse toward the centre
 * stays radial — from a square the corners arrive visibly late and the convergence reads as
 * a rectangle shrinking.
 *
 * Edges are computed **once**, here, between each node and its two nearest neighbours.
 * Recomputing them per frame would be tens of thousands of distance checks at this density,
 * but the real problem is that the graph would flicker as points drifted past each other —
 * and a structure that flickers reads as noise rather than as a network.
 *
 * The generator is seeded, so the same field is built on every machine and every visit.
 * That is not a detail: it means the composition can be judged once and trusted, rather
 * than being a different picture for every visitor.
 */
export const buildField = (density: number): Field => {
  const n = Math.max(1, Math.round(density))

  // A small linear congruential generator. Deterministic across engines, unlike Math.random.
  let seed = 20260823
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296

  const nodes: FieldNode[] = Array.from({ length: n }, () => {
    const a = rnd() * Math.PI * 2
    // The square root keeps the disc evenly covered instead of crowding the middle.
    const rad = Math.sqrt(rnd()) * 1.15
    const x = Math.cos(a) * rad
    const y = Math.sin(a) * rad * 0.62
    return {
      x,
      y,
      z: 0.55 + rnd() * 1.7,
      r: 0.7 + rnd() * 1.9,
      ph: rnd() * Math.PI * 2,
      sp: 0.25 + rnd() * 0.7,
      d: Math.hypot(x, y),
    }
  })

  const seen = new Set<string>()
  const edges: [number, number][] = []
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]
    if (!a) continue
    // The two nearest, kept by insertion rather than by sorting the whole field.
    let n1 = -1
    let d1 = Number.POSITIVE_INFINITY
    let n2 = -1
    let d2 = Number.POSITIVE_INFINITY
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue
      const b = nodes[j]
      if (!b) continue
      // Depth counts for less than position: neighbours that merely share a z read as
      // unrelated, and joining them produces long wires across the whole frame.
      const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z - b.z) * 0.35) ** 2
      if (d < d1) {
        n2 = n1
        d2 = d1
        n1 = j
        d1 = d
      } else if (d < d2) {
        n2 = j
        d2 = d
      }
    }
    for (const j of [n1, n2]) {
      if (j < 0) continue
      const key = i < j ? `${i}:${j}` : `${j}:${i}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push([i, j])
    }
  }

  return { nodes, edges }
}

export type Phases = {
  wake: number
  pulse: number
  weave: number
  collapse: number
  resolve: number
  release: number
  /**
   * How much of the field is still drawing.
   *
   * This is the line between the animation working and the animation destroying itself. The
   * field is drawn with additive compositing over a translucent wash, so if the points
   * merely converge — each keeping its size and its halo, each frame piling onto the last —
   * the centre saturates to flat white and swallows the wordmark it exists to deliver. The
   * field has to *hand its light over* and go.
   */
  alive: number
  /** How far the query front has travelled, in the same units as `FieldNode.d`. */
  front: number
  /** The moment it all arrives. */
  flash: number
}

/** Every phase of the animation at one instant. The single source of truth for a frame. */
export const phasesAt = (t: number): Phases => {
  const wake = settle(span(t, ACTS.wake))
  const pulse = span(t, ACTS.pulse)
  const weave = settle(span(t, ACTS.weave))
  const collapse = span(t, ACTS.collapse)
  const resolve = settle(span(t, ACTS.resolve))
  const release = span(t, ACTS.release)

  const spent = smooth(0.45, 1, collapse)
  const spike = smooth(0.8, 0.94, collapse) * (1 - smooth(0.94, 1, collapse) * 0.86)

  return {
    wake,
    pulse,
    weave,
    collapse,
    resolve,
    release,
    alive: wake * (1 - spent),
    front: pulse * 1.35,
    flash: spike * (1 - resolve),
  }
}

export type Projected = {
  sx: number
  sy: number
  /** Projected radius. */
  s: number
  /** Depth dimming, 0..1. */
  dim: number
}

/**
 * Perspective projection with a slow orbit.
 *
 * The orbit is what gives the field parallax — near points sweeping past far ones — rather
 * than the flat zoom you get from scaling everything by one number.
 */
export const project = (
  node: FieldNode,
  t: number,
  collapse: number,
  w: number,
  h: number,
): Projected => {
  const spin = t * 0.000045
  const cos = Math.cos(spin)
  const sin = Math.sin(spin)
  let x = node.x * cos - node.y * sin
  let y = node.x * sin + node.y * cos

  // Idle drift, until the collapse takes over.
  const wander = 1 - collapse
  x += Math.sin(t * 0.0004 * node.sp + node.ph) * 0.035 * wander
  y += Math.cos(t * 0.00035 * node.sp + node.ph) * 0.028 * wander

  // Everything falls toward the focal point, fastest at the end.
  const k = easeIn(collapse)
  x *= 1 - k
  y *= 1 - k
  const z = node.z * (1 - k * 0.55)

  const f = Math.min(w, h * 1.6) * 0.62
  return {
    sx: w / 2 + (x * f) / z,
    sy: h * 0.46 + (y * f) / z,
    s: node.r / z,
    dim: Math.min(1, 1.15 / z),
  }
}

/** The minimum of the 2D context this animation touches — enough to fake in a test. */
export type PaintTarget = Pick<
  CanvasRenderingContext2D,
  | 'fillRect'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'globalCompositeOperation'
  | 'beginPath'
  | 'arc'
  | 'ellipse'
  | 'fill'
  | 'stroke'
  | 'moveTo'
  | 'lineTo'
  | 'createRadialGradient'
>

/**
 * One frame.
 *
 * Returns whether anything was drawn, so the caller can stop asking once the field has
 * spent itself.
 */
export const paint = (
  ctx: PaintTarget,
  field: Field,
  t: number,
  w: number,
  h: number,
  signal: string,
): boolean => {
  const [sr, sg, sb] = hexToRgb(signal)
  const p = phasesAt(t)

  /* Trails, not a clear. Each frame lays a translucent wash over the last, so a moving
     point leaves a comet rather than a dot — and during the collapse the whole field turns
     into streaks for free. Outside the collapse the wash is nearly opaque, which is what
     keeps old frames from accumulating into fog. */
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle =
    p.collapse > 0 && p.collapse < 1 ? 'rgba(4,26,33,0.42)' : 'rgba(4,26,33,0.92)'
  ctx.fillRect(0, 0, w, h)

  if (p.alive <= 0.004) return false

  ctx.globalCompositeOperation = 'lighter'

  const px: number[] = []
  const py: number[] = []
  const plit: number[] = []

  for (let i = 0; i < field.nodes.length; i++) {
    const node = field.nodes[i]
    if (!node) continue
    const q = project(node, t, p.collapse, w, h)
    px[i] = q.sx
    py[i] = q.sy

    /* A node ignites as the front passes it and stays lit. The wave should leave the
       network behind it, not sweep it clean again — a retrieval that forgets what it found
       is not a picture of anything. */
    const lit = clamp((p.front - node.d) * 4)
    plit[i] = lit

    const base = 0.16 + 0.42 * q.dim
    const glow = lit * (0.55 + 0.45 * Math.sin(t * 0.006 + node.ph))
    const a = p.alive * (base * (1 - lit * 0.35) + glow * 0.9)
    // Tightening as it falls, not swelling: a point nearing the focus is becoming part of
    // one thing, and a hundred swelling suns are what produce a white-out.
    const rad = q.s * (1 + lit * 1.5) * (1 - p.collapse * 0.4)

    if (lit > 0.02 && p.collapse < 0.75) {
      const halo = ctx.createRadialGradient(q.sx, q.sy, 0, q.sx, q.sy, rad * 5.5)
      halo.addColorStop(0, `rgba(${sr},${sg},${sb},${(a * 0.5 * (1 - p.collapse)).toFixed(3)})`)
      halo.addColorStop(1, `rgba(${sr},${sg},${sb},0)`)
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(q.sx, q.sy, rad * 5.5, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.fillStyle =
      lit > 0.5
        ? `rgba(${sr},${sg},${sb},${a.toFixed(3)})`
        : `rgba(190,225,235,${(a * 0.8).toFixed(3)})`
    ctx.beginPath()
    ctx.arc(q.sx, q.sy, Math.max(0.4, rad), 0, Math.PI * 2)
    ctx.fill()
  }

  // Edges, once both ends are lit. This is the network finding itself.
  if (p.weave > 0) {
    ctx.lineWidth = 0.85
    for (const edge of field.edges) {
      const [i, j] = edge
      const li = plit[i]
      const lj = plit[j]
      const xi = px[i]
      const yi = py[i]
      const xj = px[j]
      const yj = py[j]
      if (li === undefined || lj === undefined) continue
      if (xi === undefined || yi === undefined || xj === undefined || yj === undefined) continue
      const s = Math.min(li, lj) * p.weave * (1 - p.collapse * 0.85)
      if (s < 0.05) continue
      ctx.strokeStyle = `rgba(${sr},${sg},${sb},${(s * 0.28 * p.alive).toFixed(3)})`
      ctx.beginPath()
      ctx.moveTo(xi, yi)
      ctx.lineTo(xj, yj)
      ctx.stroke()
    }
  }

  // The query front itself: a thin expanding ring with a soft shoulder.
  if (p.pulse > 0 && p.pulse < 1) {
    const f = Math.min(w, h * 1.6) * 0.62
    const rr = (p.front * f) / 1.05
    const fade = Math.sin(p.pulse * Math.PI)
    ctx.lineWidth = 1.4
    ctx.strokeStyle = `rgba(${sr},${sg},${sb},${(0.5 * fade * p.alive).toFixed(3)})`
    ctx.beginPath()
    ctx.ellipse(w / 2, h * 0.46, rr, rr * 0.62, 0, 0, Math.PI * 2)
    ctx.stroke()

    const shoulder = ctx.createRadialGradient(w / 2, h * 0.46, rr * 0.82, w / 2, h * 0.46, rr * 1.1)
    shoulder.addColorStop(0, `rgba(${sr},${sg},${sb},0)`)
    shoulder.addColorStop(0.6, `rgba(${sr},${sg},${sb},${(0.09 * fade * p.alive).toFixed(3)})`)
    shoulder.addColorStop(1, `rgba(${sr},${sg},${sb},0)`)
    ctx.fillStyle = shoulder
    ctx.fillRect(0, 0, w, h)
  }

  if (p.flash > 0.004) {
    const g = ctx.createRadialGradient(w / 2, h * 0.46, 0, w / 2, h * 0.46, Math.max(w, h) * 0.5)
    g.addColorStop(0, `rgba(255,255,255,${(p.flash * 0.3).toFixed(3)})`)
    g.addColorStop(0.22, `rgba(${sr},${sg},${sb},${(p.flash * 0.2).toFixed(3)})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }

  ctx.globalCompositeOperation = 'source-over'
  return true
}
