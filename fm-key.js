/* ==========================================================================
   FORGE MODE — TRAINING KEY PLUMBING
   --------------------------------------------------------------------------
   >>>  THIS IS THE ONLY FILE YOU EDIT TO CHANGE THE LINK OR THE KEY.  <<<

   APPROVAL MODEL  (changed 2026-09-24 — read this before you edit)
   ----------------------------------------------------------------
   Nobody approves the training download by hand. Completing the application
   IS the approval: the applicant mints a stamp, the stamp opens the intake,
   the bundle downloads. No queue, no "we'll email you when it's ready", no
   per-applicant action from D. Ever.

   The two doors on the training site are NOT the same door, and confusing
   them is what made the flow look approval-gated:

     /intake?code=FM-APP-XXXXXX    PUBLIC TRAINING DOWNLOAD
                                   Verifies the STAMP, not the person. Any
                                   stamp with the right shape opens it on the
                                   spot.  <-- the final button points here.

     /training                     STAFF LOGIN PORTAL
                                   Username + password. An account D cuts by
                                   hand after reading an application. It is a
                                   login FORM — passing ?code= to it does
                                   nothing at all. Never send applicants here
                                   for the download.

   Verified against the live site 2026-09-24: a freshly minted stamp the
   training site had never seen (FM-APP-Z9X8W7) unlocked /intake and served
   the full bundle. That is what makes auto-approval work with no server and
   no per-applicant work.

   The chain this file powers:

       index.html            application form — mints this applicant's stamp
            |  submit -> FormSubmit -> redirect to _next?code=...
            v
       thanks.html           "You're approved" + SHOWS the stamp
            |  button
            v
       partnering.html       "Who you're partnering with"
            |  FINAL BUTTON  -> /intake?code=FM-APP-XXXXXX
            v
       stamp verified -> training bundle downloads  (automatic, no approval)

   Contract, read straight off the live site:
       host        forge-mode-website-development.vercel.app
                   (spelled "development" — NOT "developement"; the
                    misspelled host returns Vercel DEPLOYMENT_NOT_FOUND)
       intake      /intake      <- auto-unlock download   (param: ?code=)
       portal      /training    <- staff login, manual, takes no code
       format      FM-APP-XXXXXX  (6 chars, e.g. FM-APP-A3K9Q2)
       demo code   FM-APP-DEMO01
   ========================================================================== */
(function () {
  "use strict";

  var CFG = {
    /* ---- 1. THE DOWNLOAD DOOR  <<< THE ONE THAT MATTERS >>> --------------
       /intake is the public training bundle, and the STAMP opens it — which
       is why completing the application can auto-approve the download.
       Do not point this at /training: that is the login portal, it ignores
       ?code= entirely, and it is the reason applicants used to sit in a
       queue waiting on a hand-cut account.                                  */
    INTAKE_BASE: "https://forge-mode-website-development.vercel.app/intake",

    /* ---- 2. THE STAFF LOGIN (secondary link only) ------------------------
       Accounts here are still cut by hand, so this is offered as a "your
       login lands later" note — never as the download button.               */
    PORTAL_BASE: "https://forge-mode-website-development.vercel.app/training",

    /* ---- 3. THE PARAM NAME THE INTAKE PAGE READS -------------------------
       The intake looks for ?code=, so that is what we send.                 */
    CODE_PARAM: "code",

    /* ---- 4. THE KEY ------------------------------------------------------
       "" (empty, the default) = AUTO-APPROVE.
         Every applicant mints their own FM-APP-XXXXXX on the application
         page, carries it through the chain, and it unlocks /intake the
         instant they hit the final button. Nothing for you to do per
         applicant — that is the whole point.

       Set one shared code here ONLY if you'd rather everyone use the same
       stamp. Tradeoff: every applicant then shares one queue position and
       one download log, so you can't tell who downloaded what.             */
    TRAINING_CODE: "",

    /* ---- 5. prefix used when minting per-application stamps -------------- */
    CODE_PREFIX: "FM-APP-",

    /* ---- 6. optional server mint (strictly optional) ---------------------
       Paste the mint API URL here if/when one is exposed on the training
       site (that site says "API mint lives on this site"). When set, the
       application page asks it for a REGISTERED stamp — one the training
       site knows by email, gets deduped for 10 minutes, and can put a name
       against in its download log — instead of minting locally.

       Leave "" and you lose nothing that matters: local stamps already
       unlock the download (verified 2026-09-24). You just don't get the
       name attached on the training side.                                   */
    MINT_ENDPOINT: "",

    /* where the code is cached so it survives the page hops */
    STORAGE_KEY: "fm-training-code",

    /* back-compat: anything still reading TRAINING_BASE gets the intake */
    TRAINING_BASE: "https://forge-mode-website-development.vercel.app/intake"
  };

  /* ---------------------------------------------------------------- helpers */

  function storage() {
    try {
      return window.sessionStorage || null;
    } catch (e) {
      return null; /* private browsing / file:// — fall through to URL only */
    }
  }

  function readParam(name) {
    try {
      var m = new RegExp("[?&]" + name + "=([^&#]*)").exec(window.location.search);
      return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
    } catch (e) {
      return "";
    }
  }

  /* FM-APP- + 6 uppercase alphanumerics, e.g. FM-APP-A3K9Q2.
     The intake checks this SHAPE. Anything else is junk in the URL and must
     never be forwarded, or the applicant lands on a locked door.           */
  function looksLikeStamp(code) {
    return /^FM-APP-[A-Z0-9]{6}$/.test(String(code || "").trim());
  }

  /* FM-APP- + 6 uppercase alphanumerics, e.g. FM-APP-A3K9Q2 */
  function mintLocal() {
    var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    var out = "";
    var rand = new Uint32Array(6);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(rand);
    } else {
      for (var i = 0; i < 6; i++) rand[i] = Math.floor(Math.random() * 4294967296);
    }
    for (var j = 0; j < 6; j++) out += alphabet.charAt(rand[j] % alphabet.length);
    return CFG.CODE_PREFIX + out;
  }

  function remember(code) {
    var s = storage();
    if (s && code) {
      try { s.setItem(CFG.STORAGE_KEY, code); } catch (e) {}
    }
    return code;
  }

  function recalled() {
    var s = storage();
    if (!s) return "";
    try { return s.getItem(CFG.STORAGE_KEY) || ""; } catch (e) { return ""; }
  }

  /* Optional: fetch a REGISTERED stamp from the mint API. Only used when you
     set CFG.MINT_ENDPOINT. Never throws, never blocks the page.            */
  function mintRemote(email, name, done) {
    if (!CFG.MINT_ENDPOINT) { done(mintLocal()); return; }
    var settled = false;
    var finish = function (code) {
      if (settled) return;
      settled = true;
      done(looksLikeStamp(code) ? code : mintLocal());
    };
    var timer = setTimeout(function () { finish(""); }, 4000);
    try {
      fetch(CFG.MINT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: email || "", name: name || "" })
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          clearTimeout(timer);
          finish(j && (j.code || j.key || j.stamp || (j.data && j.data.code)) || "");
        })
        .catch(function () { clearTimeout(timer); finish(""); });
    } catch (e) { clearTimeout(timer); finish(""); }
  }

  /* The code for this applicant, in priority order:
       1. ?code= already in the URL   (came through the chain, and is a
                                       real stamp — junk is ignored)
       2. sessionStorage              (survives the FormSubmit round-trip)
       3. CFG.TRAINING_CODE           (shared-key mode, if you set one)
       4. a freshly minted stamp      (AUTO-APPROVE — the default)

     Step 4 is the one that removes the approval step: anyone who reaches
     the end of the chain leaves with a working key, every time.           */
  function getCode() {
    var fromUrl = readParam(CFG.CODE_PARAM);
    if (looksLikeStamp(fromUrl)) return remember(fromUrl);
    var cached = recalled();
    if (looksLikeStamp(cached)) return cached;
    if (CFG.TRAINING_CODE) return remember(CFG.TRAINING_CODE);
    return remember(mintLocal());
  }

  function withCode(url, code) {
    if (!code) return url;
    return url + (url.indexOf("?") === -1 ? "?" : "&") +
      encodeURIComponent(CFG.CODE_PARAM) + "=" + encodeURIComponent(code);
  }

  /* The auto-unlock download link — the final button. */
  function intakeUrl(code) { return withCode(CFG.INTAKE_BASE, code || getCode()); }

  /* The staff login. Takes no code on purpose: it's a login form. */
  function portalUrl() { return CFG.PORTAL_BASE; }

  /* Back-compat name — historically "the training link". It now means the
     intake (the download), which is what every caller actually wanted.    */
  function trainingUrl(code) { return intakeUrl(code); }

  /* Absolute URL of a sibling page on whatever domain we're actually served
     from — works in local preview, on Vercel, and on your real domain.
     FormSubmit requires _next to be a FULL url including https://.          */
  function siblingUrl(page, code) {
    var abs;
    try {
      abs = new URL(page, window.location.href).href;
    } catch (e) {
      abs = page; /* ancient browser — relative still works for a click */
    }
    return code ? withCode(abs, code) : abs;
  }

  /* ------------------------------------------------------- page: index.html
     Mint this applicant's stamp, put it in the _next redirect and in the
     hidden field, so it survives the FormSubmit hop AND lands in your
     email. Completing the form is what unlocks the training — the stamp is
     minted right here, at the start of the application.                    */
  function initApplication() {
    var code = getCode();

    var next = document.getElementById("fm-next");
    if (next) next.value = siblingUrl("thanks.html", code);

    var keyField = document.getElementById("fm-key-field");
    if (keyField) keyField.value = code;

    /* optional: swap in a registered stamp if a mint endpoint is configured */
    if (CFG.MINT_ENDPOINT) {
      var emailField = document.getElementById("email");
      var nameField = document.getElementById("name");
      var applyRemote = function () {
        mintRemote(
          emailField ? emailField.value : "",
          nameField ? nameField.value : "",
          function (registered) {
            if (!registered || registered === code) return;
            code = remember(registered);
            if (next) next.value = siblingUrl("thanks.html", code);
            if (keyField) keyField.value = code;
          }
        );
      };
      if (emailField) emailField.addEventListener("change", applyRemote);
    }

    var form = document.querySelector("form");
    if (form) {
      form.addEventListener("submit", function () {
        /* re-assert on the way out, in case anything re-rendered the form */
        if (next) next.value = siblingUrl("thanks.html", code);
        if (keyField) keyField.value = code;
      });
    }
  }

  /* ------------------------------------------------------ page: thanks.html
     Say "approved" (because they are), show the key, make it copyable, and
     point the CTA at partnering.html.                                      */
  function initThanks() {
    var code = getCode();

    var shown = document.querySelectorAll("[data-fm-code]");
    for (var i = 0; i < shown.length; i++) shown[i].textContent = code;

    var wrap = document.querySelectorAll("[data-fm-code-wrap]");
    for (var k = 0; k < wrap.length; k++) wrap[k].style.display = "";

    var cta = document.getElementById("fm-to-partnering");
    if (cta) cta.href = siblingUrl("partnering.html", code);

    /* "skip straight to the download" — same intake the final button hits */
    var direct = document.querySelectorAll("[data-fm-intake-link]");
    for (var d = 0; d < direct.length; d++) direct[d].href = intakeUrl(code);

    var copy = document.getElementById("fm-copy");
    if (copy) {
      copy.addEventListener("click", function () {
        var done = function () {
          copy.textContent = "Copied";
          setTimeout(function () { copy.textContent = "Copy key"; }, 1800);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(done, done);
        } else {
          /* older browsers / non-https */
          try {
            var ta = document.createElement("textarea");
            ta.value = code;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            done();
          } catch (e) { copy.textContent = code; }
        }
      });
    }
  }

  /* -------------------------------------------------- page: partnering.html
     THE FINAL BUTTON — now pointed at /intake, the door the stamp opens by
     itself. No approval, no waiting, nobody signs off.                     */
  function initPartnering() {
    var code = getCode();

    var btns = document.querySelectorAll("[data-fm-intake-link],[data-fm-training-link]");
    for (var i = 0; i < btns.length; i++) btns[i].href = intakeUrl(code);

    /* secondary: the staff login, which is still hand-cut — labelled as
       "lands later" so nobody mistakes it for the download.                */
    var portal = document.querySelectorAll("[data-fm-portal-link]");
    for (var p = 0; p < portal.length; p++) portal[p].href = portalUrl();

    var shown = document.querySelectorAll("[data-fm-code]");
    for (var j = 0; j < shown.length; j++) shown[j].textContent = code;

    var wrap = document.querySelectorAll("[data-fm-code-wrap]");
    for (var k = 0; k < wrap.length; k++) wrap[k].style.display = "";
  }

  /* ------------------------------------------------------------------ boot */
  function boot() {
    var page = document.body ? document.body.getAttribute("data-fm-page") : "";
    if (page === "application") initApplication();
    else if (page === "thanks") initThanks();
    else if (page === "partnering") initPartnering();
  }

  window.FM = {
    config: CFG,
    getCode: getCode,
    mintLocal: mintLocal,
    mintRemote: mintRemote,
    looksLikeStamp: looksLikeStamp,
    intakeUrl: intakeUrl,
    portalUrl: portalUrl,
    trainingUrl: trainingUrl, /* back-compat -> intakeUrl */
    siblingUrl: siblingUrl
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

/* ==========================================================================
   THE TWO MODES
   --------------------------------------------------------------------------
   AUTO-APPROVE (default — CFG.TRAINING_CODE = "")
     Every applicant mints their own FM-APP-XXXXXX on the application page.
     It rides through the FormSubmit redirect, shows on the Thanks page,
     lands in your email, and unlocks the training download at the final
     button. Nothing to approve, nothing to send, per applicant, ever.

     This works because /intake verifies the STAMP, not the person. Tested
     2026-09-24 with a stamp the training site had never seen
     (FM-APP-Z9X8W7): unlocked, full bundle served. The old warning in this
     file — "a locally generated stamp has the right shape but the training
     site has never seen it" — was true of /training (login portal) and is
     NOT true of /intake (download). That distinction is the whole fix.

   SHARED KEY (opt-in — set CFG.TRAINING_CODE)
     Everyone gets the same code. Still auto-approved, still instant. Costs
     you attribution: one queue position, one download log, no way to tell
     which applicant downloaded. Only worth it if you need a code the
     training site already knows by name.

   ABOUT THE STAFF LOGIN
     /training still issues logins by hand, and that lives in the
     forge-mode-website repo, not this one. Nothing in this repo can make
     that automatic. What this repo now guarantees is that the DOWNLOAD
     never waits on it — the applicant trains today, the login lands later.
     The intake page already says as much: "Your application stamp still
     opens the public training download."
   ========================================================================== */
