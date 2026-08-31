# @autopilot/scan

The scan, end to end: point it at a live website and it returns a `ScanReport`.

It lived in `apps/cli` until now, and the web app imported it from there — an application
depending on another application as a library. Three things followed from that, and all
three would have got worse:

- `ScanReport` is the type the entire product is built around: the web report, the
  dashboard, the report view, the text renderer. It was owned by the command-line tool.
- Deploying the web app dragged in the CLI's dependency tree, which includes the database,
  the job runner and the agent — none of which the scan touches.
- Anything else that ever needs to scan (a worker running the monthly re-measure, an API
  route, a scheduled job) would have had to import from the CLI too.

Now both apps depend on this, and this depends on nothing above it.

The site fixtures live here as well (`src/testing/`), because they are fixtures of *a site
to be scanned* — a realistic Israeli small-business site before and after its content is
fixed, plus the five ways a real site defeats a naive crawler: a JavaScript shell,
windows-1255 Hebrew, Cloudflare-style bot protection, apex-to-www redirects, and slow
shared hosting.
