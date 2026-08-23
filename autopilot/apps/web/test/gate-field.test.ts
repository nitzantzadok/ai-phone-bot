import { describe, expect, it } from 'vitest'
import {
  ACTS,
  GATE_DURATION,
  buildField,
  hexToRgb,
  paint,
  phasesAt,
  project,
  span,
  type PaintTarget,
} from '@/components/gate-field'

/**
 * The entrance is one clock and seven overlapping windows, and the failure modes are all
 * arithmetic: an act that finishes after the door has already lifted, a field that piles its
 * light into the centre instead of handing it over, a graph that joins a point to nothing.
 * None of those need a browser to catch, so none of them are left to be caught by eye.
 */

const eachMs = (step: number) => {
  const out: number[] = []
  for (let t = 0; t <= GATE_DURATION; t += step) out.push(t)
  return out
}

describe('the timeline', () => {
  it('fits every act inside one entrance', () => {
    for (const [name, [a, b]] of Object.entries(ACTS)) {
      expect(b, `${name} ends after the door has lifted`).toBeLessThanOrEqual(GATE_DURATION)
      expect(a, `${name} starts before the clock does`).toBeGreaterThanOrEqual(0)
      expect(b, `${name} has no duration`).toBeGreaterThan(a)
    }
  })

  it('overlaps the acts, so the sequence reads as one event and not five', () => {
    // Each act begins before the previous one has finished. A sequence assembled end to end
    // reads as a list of effects being played at you.
    expect(ACTS.pulse[0]).toBeLessThan(ACTS.wake[1] + 1)
    expect(ACTS.weave[0]).toBeLessThan(ACTS.pulse[1])
    expect(ACTS.collapse[0]).toBeLessThan(ACTS.weave[1])
    expect(ACTS.resolve[0]).toBeLessThan(ACTS.collapse[1])
  })

  it('holds the finished name long enough to read and no longer', () => {
    const held = ACTS.hold[1] - ACTS.hold[0]
    expect(held).toBeGreaterThanOrEqual(900)
    // A door somebody has to wait out is a toll, however good it looks.
    expect(GATE_DURATION).toBeLessThanOrEqual(7000)
  })

  it('keeps every phase inside 0..1 across the whole entrance', () => {
    for (const t of eachMs(25)) {
      const p = phasesAt(t)
      for (const [name, v] of Object.entries(p)) {
        if (name === 'front') continue // travels past 1 by design; it has to clear the field
        expect(Number.isFinite(v), `${name} at ${t}ms`).toBe(true)
        expect(v, `${name} at ${t}ms`).toBeGreaterThanOrEqual(0)
        expect(v, `${name} at ${t}ms`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('clamps a window rather than running past its ends', () => {
    expect(span(-500, [0, 100])).toBe(0)
    expect(span(5000, [0, 100])).toBe(1)
    expect(span(50, [0, 100])).toBeCloseTo(0.5)
  })
})

describe('the collapse', () => {
  /**
   * The one defect that made the animation unusable: the field is drawn additively over a
   * translucent wash, so points that converge while keeping their size and their halos
   * saturate the centre to flat white and swallow the wordmark. The field has to spend
   * itself. This is that guarantee, as a number.
   */
  it('hands its light over instead of piling it into the middle', () => {
    const at = (k: number) => phasesAt(ACTS.collapse[0] + (ACTS.collapse[1] - ACTS.collapse[0]) * k)

    // The first half is the part worth watching, so the field is still all there for it —
    // that is where the trails come from.
    expect(at(0.4).alive).toBeGreaterThan(0.9)
    // By the time the points are genuinely on top of each other it is nearly gone.
    expect(at(0.85).alive).toBeLessThan(0.3)
    expect(at(1).alive).toBe(0)
  })

  it('never grows brighter as it converges', () => {
    // The white-out came from the field getting *more* light exactly as it took up less
    // room. Whatever else changes, alive may only fall once the collapse has started.
    let previous = Number.POSITIVE_INFINITY
    for (let t = ACTS.collapse[0]; t <= ACTS.collapse[1]; t += 10) {
      const a = phasesAt(t).alive
      expect(a, `at ${t}ms`).toBeLessThanOrEqual(previous + 1e-9)
      previous = a
    }
  })

  it('is fully spent before the name is finished resolving', () => {
    const p = phasesAt(ACTS.resolve[1])
    expect(p.alive).toBe(0)
    expect(p.resolve).toBeCloseTo(1)
  })

  it('flashes once, inside the collapse, and never afterwards', () => {
    let peak = 0
    let peakAt = 0
    for (const t of eachMs(10)) {
      const f = phasesAt(t).flash
      if (f > peak) {
        peak = f
        peakAt = t
      }
    }
    expect(peak).toBeGreaterThan(0.3)
    expect(peakAt).toBeGreaterThan(ACTS.collapse[0])
    expect(peakAt).toBeLessThan(ACTS.collapse[1])
    expect(phasesAt(ACTS.hold[0]).flash).toBe(0)
  })

  it('lifts the cover only at the very end', () => {
    expect(phasesAt(ACTS.hold[0]).release).toBe(0)
    expect(phasesAt(GATE_DURATION).release).toBe(1)
  })
})

describe('the field', () => {
  it('is the same field on every machine and every visit', () => {
    const a = buildField(120)
    const b = buildField(120)
    expect(a.nodes).toEqual(b.nodes)
    expect(a.edges).toEqual(b.edges)
  })

  it('fills a disc, so the collapse stays radial', () => {
    // Out of a square the corners arrive visibly late and the convergence reads as a
    // rectangle shrinking rather than as a network gathering.
    for (const node of buildField(300).nodes) {
      const inside = node.x ** 2 + (node.y / 0.62) ** 2
      expect(inside).toBeLessThanOrEqual(1.15 ** 2 + 1e-9)
    }
  })

  it('gives every node a neighbour, so nothing floats unconnected', () => {
    const { nodes, edges } = buildField(200)
    const joined = new Set<number>()
    for (const [i, j] of edges) {
      joined.add(i)
      joined.add(j)
    }
    expect(joined.size).toBe(nodes.length)
  })

  it('never joins a node to itself or draws the same edge twice', () => {
    const { edges } = buildField(200)
    const keys = new Set<string>()
    for (const [i, j] of edges) {
      expect(i).not.toBe(j)
      keys.add(i < j ? `${i}:${j}` : `${j}:${i}`)
    }
    expect(keys.size).toBe(edges.length)
  })

  it('survives a degenerate density rather than dividing by zero', () => {
    const one = buildField(1)
    expect(one.nodes).toHaveLength(1)
    expect(one.edges).toHaveLength(0)
  })
})

describe('projection', () => {
  it('puts the whole field on the focal point by the end of the collapse', () => {
    const { nodes } = buildField(200)
    const w = 1200
    const h = 800
    for (const node of nodes) {
      const q = project(node, ACTS.collapse[1], 1, w, h)
      expect(Math.abs(q.sx - w / 2)).toBeLessThan(0.5)
      expect(Math.abs(q.sy - h * 0.46)).toBeLessThan(0.5)
    }
  })

  it('keeps near points larger than far ones', () => {
    const near = { x: 0.5, y: 0.2, z: 0.6, r: 1, ph: 0, sp: 0.5, d: 0.5 }
    const far = { ...near, z: 2.2 }
    expect(project(near, 0, 0, 1200, 800).s).toBeGreaterThan(project(far, 0, 0, 1200, 800).s)
    expect(project(near, 0, 0, 1200, 800).dim).toBeGreaterThan(project(far, 0, 0, 1200, 800).dim)
  })
})

describe('painting', () => {
  const record = () => {
    const calls: string[] = []
    const colours: string[] = []
    const gradient = {
      addColorStop: (_o: number, c: string) => {
        colours.push(c)
      },
    }
    const ctx = {
      globalCompositeOperation: 'source-over',
      fillStyle: '' as unknown,
      strokeStyle: '' as unknown,
      lineWidth: 0,
      fillRect: () => calls.push('fillRect'),
      beginPath: () => calls.push('beginPath'),
      arc: () => calls.push('arc'),
      ellipse: () => calls.push('ellipse'),
      fill: () => calls.push('fill'),
      stroke: () => calls.push('stroke'),
      moveTo: () => calls.push('moveTo'),
      lineTo: () => calls.push('lineTo'),
      createRadialGradient: () => {
        calls.push('gradient')
        return gradient
      },
    } as unknown as PaintTarget
    return { ctx, calls, colours }
  }

  const field = buildField(80)

  it('draws through the whole entrance without producing an unusable colour', () => {
    for (const t of eachMs(50)) {
      const { ctx, colours } = record()
      paint(ctx, field, t, 1200, 800, '#5fd0e0')
      for (const c of colours) {
        expect(c, `at ${t}ms`).not.toContain('NaN')
        const alpha = Number(c.slice(c.lastIndexOf(',') + 1, -1))
        expect(alpha, `alpha at ${t}ms`).toBeGreaterThanOrEqual(0)
        expect(alpha, `alpha at ${t}ms`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('stops drawing the field once it has been spent', () => {
    expect(paint(record().ctx, field, ACTS.weave[1], 1200, 800, '#5fd0e0')).toBe(true)
    expect(paint(record().ctx, field, ACTS.hold[0], 1200, 800, '#5fd0e0')).toBe(false)
  })

  it('draws the query ring while the question is travelling, and not before', () => {
    const early = record()
    paint(early.ctx, field, ACTS.pulse[0] - 100, 1200, 800, '#5fd0e0')
    expect(early.calls).not.toContain('ellipse')

    const during = record()
    paint(during.ctx, field, (ACTS.pulse[0] + ACTS.pulse[1]) / 2, 1200, 800, '#5fd0e0')
    expect(during.calls).toContain('ellipse')
  })

  it('leaves the context on normal compositing, so nothing painted after it is additive', () => {
    const { ctx } = record()
    paint(ctx, field, ACTS.weave[1], 1200, 800, '#5fd0e0')
    expect(ctx.globalCompositeOperation).toBe('source-over')
  })

  it('reads a colour in either notation', () => {
    expect(hexToRgb('#5fd0e0')).toEqual([95, 208, 224])
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
  })
})
