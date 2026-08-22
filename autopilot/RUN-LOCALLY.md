# Getting your own score, today, on your own Mac

No hosting, no account, no API key. About five minutes, most of it downloading.

## Once, to set up

Open **Terminal** (⌘-Space, type "Terminal") and paste these one at a time.

```bash
# Node 22+ and pnpm. Skip if you already have them.
brew install node
corepack enable
```

```bash
git clone https://github.com/nitzantzadok/ai-phone-bot.git
cd ai-phone-bot/autopilot
git checkout claude/ai-recommendation-autopilot-4pr0dq
pnpm install
```

## Scan a site

```bash
pnpm scan https://www.gillis.co.il
```

The report prints in Hebrew: what the site says about the business, what is missing, the
readiness score with its three components, the technical findings, and the fixes in
priority order.

Swap the address for any business you want to scan. It reads only public pages and
respects `robots.txt`.

## The same thing, in a browser

```bash
pnpm web
```

Then open **http://localhost:3000/join**, type an address, press the button. This is the
identical flow that a visitor gets on a deployed site — useful for seeing what a customer
would see, and for showing someone the product over a screen share.

## Adding the AI half

Everything above measures your website. To also measure whether an assistant names the
business, you need a provider key. Get one from
[console.anthropic.com](https://console.anthropic.com), then:

```bash
ANTHROPIC_API_KEY=sk-ant-... pnpm scan https://www.gillis.co.il
```

The report then adds the recommendation rate, the AIRS score, which competitors were named
instead, and what the run cost. A scan of 24 questions costs a few agorot.

Without a key that section says NOT MEASURED and explains why. It is never simulated.

## When you want a link to send people

That is `DEPLOY-SCAN.md` — the same app, hosted, so a business owner can scan their own
site without touching a terminal.
