# Putting the free scan online

The goal of this page is one link you can send to a business owner, where they type their
website address and get a real scan back on screen.

That needs **no database, no Redis, no accounts and no API key.** Everything the free scan
does happens inside one request.

---

## Option A — Vercel (about ten minutes)

1. **Push the repository to GitHub.** It already is:
   `github.com/nitzantzadok/ai-phone-bot`, branch
   `claude/ai-recommendation-autopilot-4pr0dq`.

2. **Create a project at vercel.com → Add New → Project**, and import that repository.

3. **Set the root directory to `autopilot`.** This is the one setting people miss. The
   repository root holds a different application; the monorepo lives one level down.

4. **Environment variables.** Only one is required:

   | Name | Value |
   |---|---|
   | `DEPLOYMENT_MODE` | `scan-only` |
   | `APP_ENV` | `production` |

   `DEPLOYMENT_MODE=scan-only` tells the configuration validator that this deployment
   serves the free scan and nothing that stores data, so it does not demand a database or
   session secrets it would have no use for.

   Optional, and worth adding as soon as you have one:

   | Name | Value | Effect |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | your key | The scan also asks a real assistant and reports whether the business was named |
   | `OPENAI_API_KEY` | your key | Same, through OpenAI |
   | `GEMINI_API_KEY` | your key | Same, through Gemini |

   Without any of them the AI half of the report says NOT MEASURED and explains why. That
   is a working product, not a broken one — the site half is the part that produces the
   fixes.

5. **Deploy.** When it finishes you have a URL like
   `https://your-project.vercel.app`. The link to send people is:

   ```
   https://your-project.vercel.app/join
   ```

6. **Try it** with a real Israeli business site before you share it.

### A note on time limits

A crawl of a small site takes a few seconds; a large or slow site can take longer, and the
AI half adds more. `vercel.json` asks for 120 seconds on the scan route. On Vercel's Hobby
plan the ceiling is lower, so if you see a timeout on a big site, that is why — either
move to a paid plan or lower `maxPages` in `apps/web/src/app/scan/result.tsx`.

---

## Option B — any container host (Railway, Render, Fly, a VPS)

```bash
cd autopilot
pnpm install
pnpm --filter @autopilot/web run build
APP_ENV=production DEPLOYMENT_MODE=scan-only \
  pnpm --filter @autopilot/web run start
```

That serves on port 3000. Put it behind your own domain and TLS. There is no long-running
worker to deploy and nothing to migrate, because nothing is stored.

---

## Option C — no deployment at all

If you want to run scans for people one at a time before committing to hosting:

```bash
cd autopilot
pnpm install
pnpm scan https://their-site.co.il
```

Print or copy the report and send it to them. This is worth doing for your first handful
of customers anyway — reading ten real reports will tell you more about what to build next
than any amount of planning.

---

## What is still missing before this is a business

The free scan is complete and honest. These are not:

- **Accounts and saved history.** A customer cannot come back and see last month's score.
  That is the `full` deployment mode, and it needs Postgres and Redis.
- **Billing.** The plans and VAT calculations are implemented and tested, but no payment
  processor is connected.
- **The autopilot itself** — the agent that makes the fixes for a customer — needs the
  website connector authorised per customer, which needs accounts.

Deploy the scan first. It is the part that gets you a conversation with a business owner,
and everything else is easier to prioritise once you have had twenty of those.
