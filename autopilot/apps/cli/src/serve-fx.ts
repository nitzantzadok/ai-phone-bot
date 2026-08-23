import { startDemoSite } from './testing/demo-site.ts'
import { writeFileSync } from 'node:fs'
const site = await startDemoSite(process.argv[3] === 'after' ? 'after' : 'before')
writeFileSync(process.argv[2]!, site.origin)
setInterval(() => {}, 1 << 30)
