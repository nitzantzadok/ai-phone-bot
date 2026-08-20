# Marketing

## `join.html` — the shareable join page

A single self-contained HTML file: no build step, no backend, no dependency
beyond Google Fonts. Open it locally, drop it on any static host, or hand the
link to a business owner. Hebrew by default with a live English toggle, RTL
throughout, and a light and dark theme that follow the reader's system.

It exists because the product's first contact with a customer cannot require
the product to be deployed. A prospect who was sent a link needs to understand
what this is, see step-by-step joining instructions for their own platform, and
be able to reach us — from a page that is just a file.

### Before you share it

Two values at the top of the script decide whether the send buttons work:

```js
const OWNER = {
  email: 'REPLACE-WITH-YOUR-EMAIL@example.com',
  whatsapp: '9725XXXXXXXX',            // international format, digits only
};
```

Until they are filled in, the two send buttons stay hidden and the result panel
carries a note saying so — visitors can still copy their details and send them
themselves, so the page is never broken, only incomplete. Fill both in and the
buttons appear: the email button opens a prefilled `mailto:`, the WhatsApp
button opens `wa.me` with the same text.

Nothing is transmitted anywhere by the page itself. The visitor's own mail or
WhatsApp client sends the message, which means the visitor sees exactly what
leaves their device and stays in control of it.

### What the page contains

- The before/after answer box: the same question answered twice, showing what
  changes when the three facts a question rests on are actually written down.
- Four things a business can do today without becoming a customer, drawn from
  `packages/insights`.
- Step-by-step joining instructions per platform (WordPress, Wix, Shopify,
  Webflow, Squarespace, custom, no site yet, and Google Business Profile),
  mirroring `packages/insights/src/platforms.ts` — each labelled honestly as
  *we fix it for you*, *guided, you paste*, or *scanning only for now*.
- What we control and what we do not, stated plainly.
- Pricing with VAT shown, and the free tier that needs no card.
- The join form, and a FAQ.

### Keeping it in step with the app

The platform guides here are a copy of `packages/insights/src/platforms.ts`,
duplicated deliberately so the page stays a single file with no build. When a
guide changes there, change it here too — the copy in this file is the one a
prospect reads.
