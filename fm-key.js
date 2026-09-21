/* ==========================================================================
   FORGE MODE — TRAINING KEY PLUMBING
   --------------------------------------------------------------------------
   >>>  THIS IS THE ONLY FILE YOU EDIT TO CHANGE THE LINK OR THE KEY.  <<<

   The chain this file powers (this is the flow the live training page
   documents under "How the funnel works"):

       index.html            application form
            |  submit -> FormSubmit -> redirect to _next?code=...
            v
       thanks.html           "You're in the queue" + SHOWS the access key
            |  button
            v
       partnering.html       "Who you're partnering with"
            |  FINAL BUTTON  <-- this is the link that was missing
            v
       .../training?code=FM-APP-XXXXXX
            |  key verified
            v
       training bundle unlocks

   Contract, read straight off the live intake page:
       host        forge-mode-website-development.vercel.app
                   (spelled "development" — NOT "developement"; the
                    misspelled host returns Vercel DEPLOYMENT_NOT_FOUND)
       path        /training
       param       code          <-- NOT "key"
       format      FM-APP-XXXXXX  (6 chars, e.g. FM-APP-A3K9Q2)
       demo code   FM-APP-DEMO01  (accepted by the live page for testing)
   ========================================================================== */
(function () {
  "use strict";

  var CFG = {
    /* ---- 1. THE TRAINING PAGE -------------------------------------------
       Misspelling this host is what sends applicants to a Vercel 404.       */
    TRAINING_BASE: "https://forge-mode-website-development.vercel.app/training",

    /* ---- 2. THE PARAM NAME THE TRAINING PAGE READS ----------------------
       The intake form looks for ?code=, so that is what we send.            */
    CODE_PARAM: "code",

    /* ---- 3. YOUR KEY   <<<<<< EDIT THIS ONE LINE >>>>>> ------------------
       One shared key for every applicant — the "special key that only you
       have" that unlocks the training material.

       Right now it holds Forge Mode's public DEMO key, so you can click the
       whole chain end to end and watch the intake page accept it.
       REPLACE IT WITH YOUR REAL KEY before applicants use this.

       Set it to "" (empty string) to switch to MODE B — a fresh
       per-application stamp minted for each applicant. See bottom of file.  */
    TRAINING_CODE: "FM-APP-DEMO01",

    /* ---- 4. prefix used when minting per-application stamps ------------- */
    CODE_PREFIX: "FM-APP-",

    /* ---- 5. optional server mint ----------------------------------------
       Paste the mint API URL here if/when you expose one on the training
       site (the intake page says "API mint lives on this site"). When set,
       MODE B asks it for a real registered stamp instead of generating one
       locally. Leave "" to mint in the browser.                             */
    MINT_ENDPOINT: "",

    /* where the code is cached so it survives the page hops */
    STORAGE_KEY: "fm-training-code"
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

  /* MODE B: fetch a registered stamp from the mint API, else mint locally.
     Never throws, never blocks the page — worst case you get a local stamp. */
  function mintRemote(email, name, done) {
    if (!CFG.MINT_ENDPOINT) { done(mintLocal()); return; }
    var settled = false;
    var finish = function (code) {
      if (settled) return;
      settled = true;
      done(code && /^FM-APP-/.test(code) ? code : mintLocal());
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
       1. ?code= already in the URL   (came through the chain)
       2. sessionStorage              (survives the FormSubmit round-trip)
       3. CFG.TRAINING_CODE           (MODE A — your one shared key)
       4. a freshly minted stamp      (MODE B)                            */
  function getCode() {
    var fromUrl = readParam(CFG.CODE_PARAM);
    if (fromUrl) return remember(fromUrl);
    var cached = recalled();
    if (cached) return cached;
    if (CFG.TRAINING_CODE) return remember(CFG.TRAINING_CODE);
    return remember(mintLocal());
  }

  function withCode(url, code) {
    if (!code) return url;
    return url + (url.indexOf("?") === -1 ? "?" : "&") +
      encodeURIComponent(CFG.CODE_PARAM) + "=" + encodeURIComponent(code);
  }

  function trainingUrl(code) { return withCode(CFG.TRAINING_BASE, code || getCode()); }

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
     Fill _next with an absolute thanks.html URL carrying the code, and add a
     hidden field so the key also lands in your FormSubmit email.            */
  function initApplication() {
    var code = getCode();

    var next = document.getElementById("fm-next");
    if (next) next.value = siblingUrl("thanks.html", code);

    var keyField = document.getElementById("fm-key-field");
    if (keyField) keyField.value = code;

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
     Show the key, make it copyable, and point the CTA at partnering.html.   */
  function initThanks() {
    var code = getCode();

    var shown = document.querySelectorAll("[data-fm-code]");
    for (var i = 0; i < shown.length; i++) shown[i].textContent = code;

    var wrap = document.querySelectorAll("[data-fm-code-wrap]");
    for (var k = 0; k < wrap.length; k++) wrap[k].style.display = "";

    var cta = document.getElementById("fm-to-partnering");
    if (cta) cta.href = siblingUrl("partnering.html", code);

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
     THE FINAL BUTTON. This is the click that was missing entirely.          */
  function initPartnering() {
    var code = getCode();
    var btns = document.querySelectorAll("[data-fm-training-link]");
    for (var i = 0; i < btns.length; i++) btns[i].href = trainingUrl(code);

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
    trainingUrl: trainingUrl,
    siblingUrl: siblingUrl
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

/* ==========================================================================
   MODE B — one stamp per application
   --------------------------------------------------------------------------
   Set CFG.TRAINING_CODE = "" and every applicant gets their own
   FM-APP-XXXXXX, generated on the application page, carried through the URL
   and sessionStorage, shown on the Thanks page, emailed to you, and appended
   to the final button.

   IMPORTANT: a locally generated stamp has the right shape but the training
   site has never seen it. If that site verifies codes against its own
   records, a local stamp will be rejected. To make MODE B verify for real,
   paste the mint endpoint into CFG.MINT_ENDPOINT — then this file asks your
   API for a registered stamp and only falls back to a local one if the call
   fails. The intake page's promise that re-applying with the same email
   within 10 minutes returns the SAME code can only be kept server-side,
   which is why that endpoint matters.

   Until then, MODE A (one shared key you control) is the version that is
   guaranteed to unlock.
   ========================================================================== */
