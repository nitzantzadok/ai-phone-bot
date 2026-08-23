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
cd ai-phone-bot
git checkout claude/ai-recommendation-autopilot-4pr0dq
cd autopilot
bash setup.sh
```

The `git checkout` line is not optional. `git clone` fetches the default branch, and this
work lives on a branch of its own — without it half the files are missing, `setup.sh`
among them, and the first command you run fails with `No such file or directory`.

`setup.sh` checks each prerequisite and installs; it says in Hebrew what is missing and
what to do about it.

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

Then open **http://localhost:3100**

The server prints a box with the address to open. **That box is the address** — not
whatever any guide says, including this one. `pnpm web` finds a free port before starting
(3100 upward), so it never lands on a port something else already owns, and it tells you
which one it took. 3000 is the default for nearly every Node project, so anyone running
more than one meets a collision on their first try.

Two things worth knowing the first time:

- **The terminal window running the server is occupied.** Anything you type into it goes
  to the server and does nothing. Open a new window (⌘N) for other commands.
- **Stopping the server:** `Ctrl + C` in that window., type an address, press the button. This is the
identical flow that a visitor gets on a deployed site — useful for seeing what a customer
would see, and for showing someone the product over a screen share.

## Adding the AI half

Everything above measures your website. To also measure whether an assistant names the
business, you need a provider key. Get one from
[console.anthropic.com](https://console.anthropic.com) or
[platform.openai.com](https://platform.openai.com).

Put it in `autopilot/.env`, which is gitignored:

```bash
echo 'OPENAI_API_KEY=sk-proj-...' >> .env
pnpm scan https://www.gillis.co.il
```

Use the file rather than the command line — a key typed into a command is stored in your
shell history and visible in the process list.

If every call fails (wrong key, no quota, no network) the report says so and names the
reason. It will not report "0% of questions" as though it had asked and been left out.

The report then adds the recommendation rate, the AIRS score, which competitors were named
instead, and what the run cost. A scan of 24 questions costs a few agorot.

Without a key that section says NOT MEASURED and explains why. It is never simulated.

## When you want a link to send people

That is `DEPLOY-SCAN.md` — the same app, hosted, so a business owner can scan their own
site without touching a terminal.

## When your changes do not appear

You pull, you reload, and the page looks exactly as it did. Almost always this is the build
cache rather than anything you did: Tailwind generates its utilities from the `@theme` block
at build time, so a new design token or a class the project has never used before needs that
cache rebuilt. Until it is, the running server serves the new markup with the old
stylesheet — old colours, missing spacing, on a layout that has already changed underneath
it. It looks precisely like "nothing I changed had any effect", and no amount of reloading
the browser fixes it.

Stop the server with `Ctrl + C`, then:

```bash
pnpm web:fresh
```

That deletes the cache and starts again. The first page takes a few seconds longer; after
that it behaves normally. Then reload the browser with `Cmd + Shift + R`, which bypasses the
browser's own cache — an ordinary reload can still serve you the old stylesheet from disk.
