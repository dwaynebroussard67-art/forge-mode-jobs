# Forge Mode — jobs / application site

Three static pages plus one script. No build step, no dependencies — works on
any static host (Vercel, GitHub Pages, S3, nginx).

| File | Role |
| --- | --- |
| `index.html` | Sales representative application form (posts to FormSubmit) |
| `thanks.html` | "You're in the queue" — shows the applicant their training key |
| `partnering.html` | "Who you're partnering with" — carries **the final button** |
| `fm-key.js` | Training-key plumbing. **The only file you edit to change the link or the key.** |

## The application chain

```
index.html                      applicant fills the form, submits
   |  FormSubmit emails you, then redirects to _next?code=FM-APP-XXXXXX
   v
thanks.html                     shows the key, button onward
   |
   v
partnering.html                 the walkthrough, then...
   |  FINAL BUTTON
   v
forge-mode-website-development.vercel.app/training?code=FM-APP-XXXXXX
   |  key verified
   v
training bundle unlocks
```

## Changing the key or the training URL

Open `fm-key.js` and edit the `CFG` block near the top:

- **`TRAINING_CODE`** — your key. This is the one applicants get.
- **`TRAINING_BASE`** — the training intake URL.
- **`CODE_PARAM`** — the query param the intake page reads.

That's it. Every link on every page is generated from those three values, so
there is nowhere else to update and nothing to drift out of sync.

`TRAINING_CODE` currently holds Forge Mode's public **demo** key
(`FM-APP-DEMO01`) so the whole chain can be clicked end to end and seen to
unlock. **Replace it with the real key before sending applicants through.**

## Two gotchas this repo already hit

1. **The host is spelled `development`, not `developement`.** The misspelled
   host returns Vercel's `DEPLOYMENT_NOT_FOUND` page, so a link built with it
   looks fine in the code and dead-ends in the browser.
2. **The intake page reads `?code=`, not `?key=`.** Sending `?key=` lands the
   applicant on the intake form with an empty key field.

## Modes

**Mode A — one shared key (default).** `TRAINING_CODE` is set, every applicant
gets that same key. Guaranteed to unlock, because it's a key you control on the
training side.

**Mode B — one stamp per application.** Set `TRAINING_CODE = ""` and each
applicant gets a fresh `FM-APP-XXXXXX`, carried through the chain, shown on the
Thanks page and emailed to you. A locally generated stamp has the right shape
but the training site has never seen it — if that site verifies codes against
its own records, paste your mint endpoint into `CFG.MINT_ENDPOINT` so the stamp
is registered server-side. See the notes at the bottom of `fm-key.js`.

## No-JavaScript safety

Every link in the chain is hardcoded in the HTML as well as rewritten by
`fm-key.js`, so the chain still connects with scripting disabled. The `_next`
redirect falls back to the live jobs domain in that case.
