# Forge Mode — jobs / application site

Three static pages plus one script. No build step, no dependencies — works on
any static host (Vercel, GitHub Pages, S3, nginx).

| File | Role |
| --- | --- |
| `index.html` | Sales representative application form (posts to FormSubmit) |
| `thanks.html` | "You're approved" — shows the applicant their training key |
| `partnering.html` | "Who you're partnering with" — carries **the final button** |
| `fm-key.js` | Training-key plumbing. **The only file you edit to change the link or the key.** |

## Approval model: nobody approves the download

Completing the application **is** the approval. The applicant mints a stamp
(`FM-APP-XXXXXX`) on the application page, carries it through the chain, and it
opens the training download the instant they click the final button. There is no
queue, no "we'll email you when it's ready", and no per-applicant action for D.

That works because the training site has **two different doors**, and only one
of them is gated:

| Door | What it is | Gated? |
| --- | --- | --- |
| `/intake?code=FM-APP-XXXXXX` | The public training **download**. Verifies the **stamp**, not the person. | **No.** Any stamp with the right shape opens it on the spot. |
| `/training` | The **staff login** portal. Username + password, an account cut by hand after an application is read. | Yes — by design, and not from this repo. |

Verified 2026-09-24 against the live site: a stamp the training site had never
seen (`FM-APP-Z9X8W7`) unlocked `/intake` and served the full bundle, while
`/training?code=FM-APP-DEMO01` still shows a login form — `?code=` is ignored
there entirely.

**The final button points at `/intake`.** It used to point at `/training`, which
is why the flow read as "D has to approve each applicant": every applicant was
sent to a door that only opens after an account is cut by hand.

What this repo does *not* control: the staff login. Accounts on `/training` are
still issued manually, and that lives in the `forge-mode-website` repo. Nothing
here can make that automatic — what's guaranteed here is that **the download
never waits on it**. Applicants train today; the login lands later.

## The application chain

```
index.html                      applicant fills the form, mints FM-APP-XXXXXX
   |  FormSubmit emails you, then redirects to _next?code=FM-APP-XXXXXX
   v
thanks.html                     "You're approved" — shows the stamp
   |
   v
partnering.html                 the walkthrough, then...
   |  FINAL BUTTON  ->  /intake?code=FM-APP-XXXXXX
   v
stamp verified -> training bundle downloads   (automatic, no approval)
```

## Changing the key or the training URL

Open `fm-key.js` and edit the `CFG` block near the top:

- **`INTAKE_BASE`** — the training **download** URL. Leave this on `/intake`.
- **`PORTAL_BASE`** — the staff login URL, offered as a "your login lands
  later" note. Never as the download button.
- **`TRAINING_CODE`** — set to `""` (the default) for auto-approve: every
  applicant mints their own stamp. Set a code here to give everyone the same
  one.
- **`CODE_PARAM`** — the query param the intake page reads (`code`).

That's it. Every link on every page is generated from those values, so there is
nowhere else to update and nothing to drift out of sync.

## Two modes

**Auto-approve (default — `TRAINING_CODE = ""`).** Each applicant mints their
own `FM-APP-XXXXXX` in the browser on the application page. It rides through the
FormSubmit redirect, shows on the Thanks page, lands in your FormSubmit email,
and unlocks `/intake` at the final button. Nothing to approve per applicant,
ever. The intake verifies the stamp's *shape*, so a locally minted stamp opens
the download — tested 2026-09-24 with `FM-APP-Z9X8W7`, a stamp the training site
had never seen.

**Shared key (opt-in).** Set `TRAINING_CODE` to one code and everyone gets the
same one. Still instant, still no approval step, but every applicant then shares
one queue position and one download log, so you can't tell who downloaded what.
Only worth it if you need a code the training site already knows by name.

**Optional: registered stamps.** The training site says "API mint lives on this
site". If you expose a mint endpoint, paste it into `CFG.MINT_ENDPOINT` and the
application page will ask it for a *registered* stamp — one the training site
knows by email, dedupes for 10 minutes, and can put a name against in its
download log — falling back to a local stamp if the call fails. Leave it `""`
and the download still unlocks; you just don't get the name attached on the
training side.

## Gotchas this repo already hit

1. **`/intake` downloads, `/training` logs in.** They look interchangeable and
   aren't. A `?code=` on `/training` does nothing — it's a login form. Sending
   applicants there is what created the approval gate.
2. **The host is spelled `development`, not `developement`.** The misspelled
   host returns Vercel's `DEPLOYMENT_NOT_FOUND` page, so a link built with it
   looks fine in the code and dead-ends in the browser.
3. **The intake page reads `?code=`, not `?key=`.** Sending `?key=` lands the
   applicant on the intake form with an empty key field.

## No-JavaScript safety

Every link in the chain is hardcoded in the HTML as well as rewritten by
`fm-key.js`, so the chain still connects with scripting disabled — including the
final button, which carries the demo stamp `FM-APP-DEMO01` as its no-JS
fallback. The `_next` redirect falls back to the live jobs domain in that case.
