/**
 * Prints a full report including the measured AI half, against a local engine.
 * Illustrative only: the engine's answer is fixed by this script, not by a real model.
 */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { loadEnv } from '@autopilot/shared/env.ts'
import { startDemoSite } from './testing/demo-site.ts'
import { scanBusiness } from './scan.ts'
import { renderReport } from './report-text.ts'

const ANSWER =
  'הנה מרפאות שיניים מומלצות בפתח תקווה:\n' +
  '1. מרפאת חיוך זהב — מומלצת מאוד לילדים, פתוחה עד 20:00.\n' +
  '2. דנטל סנטר הדר — מקבלים ילדים, יש חניה ונגישות.\n' +
  '3. קליניקת שן ורד — מתמחה ביישור שיניים.\n'

const engine = createServer((req, res) => {
  req.resume()
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        id: 'msg_demo',
        type: 'message',
        role: 'assistant',
        model: 'claude-demo',
        content: [{ type: 'text', text: ANSWER }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 150, output_tokens: 110 },
      }),
    )
  })
})
await new Promise<void>((resolve) => engine.listen(0, '127.0.0.1', resolve))
const engineUrl = `http://127.0.0.1:${(engine.address() as AddressInfo).port}`

const site = await startDemoSite('after')
try {
  const report = await scanBusiness({
    url: site.origin,
    language: 'he',
    allowPrivateHosts: true,
    measureAi: true,
    maxPages: 12,
    maxPrompts: 8,
    env: loadEnv({
      NODE_ENV: 'test',
      APP_ENV: 'ci',
      ANTHROPIC_API_KEY: 'sk-ant-demo',
      ANTHROPIC_BASE_URL: engineUrl,
    }),
  })
  console.log(renderReport(report))
} finally {
  await site.close()
  await new Promise<void>((resolve) => engine.close(() => resolve()))
}
