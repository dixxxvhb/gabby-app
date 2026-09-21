/* Bluebird - vanilla app. No build step, no framework. */
(function () {
  "use strict";

  var D = window.BB_DATA;
  var NS = "bluebird.";
  var VERSION = "3.0";
  // Free-tier quotas are per model, so walk a chain when one is exhausted or retired.
  var MODELS = ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest",
                "gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3-flash-preview"];
  var MODEL = MODELS[0];
  function endpointFor(m) { return "https://generativelanguage.googleapis.com/v1beta/models/" + m + ":generateContent"; }
  function modelIndex() {
    try {
      var rec = JSON.parse(sessionStorage.getItem("bluebird.modelIdx") || "null");
      if (rec && Date.now() - rec.t < 15 * 60 * 1000 && rec.i < MODELS.length) return rec.i;
    } catch (e) {}
    return 0;
  }
  function rememberModel(i) { try { sessionStorage.setItem("bluebird.modelIdx", JSON.stringify({ i: i, t: Date.now() })); } catch (e) {} }

  /* ============ storage ============ */
  var store = {
    get: function (k, dflt) {
      try {
        var raw = localStorage.getItem(NS + k);
        if (raw === null) return dflt;
        return JSON.parse(raw);
      } catch (e) { return dflt; }
    },
    set: function (k, v) {
      try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) {}
    },
    del: function (k) { try { localStorage.removeItem(NS + k); } catch (e) {} },
    wipe: function () {
      try {
        var kill = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(NS) === 0) kill.push(k);
        }
        kill.forEach(function (k) { localStorage.removeItem(k); });
      } catch (e) {}
    }
  };

  var DEFAULT_PROFILE = {
    name: "Gabby", city: "Miami, FL", styles: ["Contemporary", "Jazz", "Commercial"],
    height: "", agency: "", availability: "", union: "", dream: "", reel: "", credits: ""
  };

  function profile() {
    var p = store.get("profile", null);
    if (!p) return JSON.parse(JSON.stringify(DEFAULT_PROFILE));
    for (var k in DEFAULT_PROFILE) if (!(k in p)) p[k] = DEFAULT_PROFILE[k];
    return p;
  }
  function saveProfile(p) { store.set("profile", p); }
  function firstName() {
    var n = (profile().name || "Gabby").trim().split(/\s+/)[0];
    return n || "Gabby";
  }

  /* ============ tiny dom helpers ============ */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function ico(id, cls) { return '<svg class="ic ' + (cls || "") + '" viewBox="0 0 24 24"><use href="#' + id + '"/></svg>'; }
  function safeUrl(u) {
    u = String(u || "").trim();
    return /^https?:\/\//i.test(u) ? u : "";
  }
  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast("Copied"); }, function () { toast("Could not copy"); });
    } else { toast("Could not copy"); }
  }

  /* ============ dates + seeded random ============ */
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function dayOffset(n) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function relTime(ts) {
    if (!ts) return "";
    var diff = Date.now() - ts;
    var m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    var d = new Date(ts);
    return (d.getMonth() + 1) + "/" + d.getDate();
  }
  function auditionCountdown(dateStr) {
    var d = new Date(dateStr + "T00:00:00");
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    var diffDays = Math.round((d - now) / 86400000);
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "tomorrow";
    if (diffDays > 1) return "in " + diffDays + " days";
    if (diffDays === -1) return "yesterday";
    return Math.abs(diffDays) + " days ago";
  }
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }
  function rngFrom(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* ============ gemini ============ */
  function hasKey() { return !!store.get("geminiKey", ""); }

  function gemini(opts, attempt, mi) {
    attempt = attempt || 0;
    if (mi === undefined) mi = modelIndex();
    var key = store.get("geminiKey", "");
    if (!key) return Promise.reject(new Error("no key"));
    var model = MODELS[mi];
    var body = { contents: opts.contents };
    if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
    if (opts.tools) body.tools = opts.tools;
    if (opts.json) body.generationConfig = { responseMimeType: "application/json" };
    return fetch(endpointFor(model), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body)
    }).then(function (r) {
      var exhausted = r.status === 429 || r.status === 404 || (r.status === 503 && attempt >= 1);
      if (exhausted && !opts.tools && mi + 1 < MODELS.length) {
        // (grounded calls skip the chain: search quota is per key, so every model would say no)
        // this model is out of free quota, retired, or swamped: move down the chain
        return gemini(opts, 0, mi + 1).then(function (out) { return { _done: out }; });
      }
      if ((r.status === 503 || r.status === 500) && attempt < 2) {
        return new Promise(function (res) { setTimeout(res, 1500 * (attempt + 1)); })
          .then(function () { return gemini(opts, attempt + 1, mi); })
          .then(function (out) { return { _done: out }; });
      }
      if (!r.ok) throw new Error("http " + r.status);
      rememberModel(mi);
      return r.json();
    }).then(function (j) {
      if (j && j._done) return j._done;
      return j;
    }).then(function (j) {
      if (j && j.text) return j;
      var cand = j && j.candidates && j.candidates[0];
      if (!cand) throw new Error("empty");
      var parts = (cand.content && cand.content.parts) || [];
      var text = parts.map(function (p) { return p.text || ""; }).join("").trim();
      if (!text) throw new Error("empty text");
      return { text: text, grounding: cand.groundingMetadata || null };
    });
  }

  function turns(list) {
    return list.slice(-20).map(function (m) {
      return { role: m.role === "me" ? "user" : "model", parts: [{ text: m.text }] };
    });
  }

  function profileBlurb() {
    var p = profile();
    var bits = ["Name: " + (p.name || "Gabby"), "Based in " + (p.city || "Miami, FL")];
    if (p.styles && p.styles.length) bits.push("Styles: " + p.styles.join(", "));
    if (p.height) bits.push("Height: " + p.height);
    if (p.union) bits.push("Union: " + p.union);
    if (p.availability) bits.push("Availability: " + p.availability);
    if (p.agency) bits.push("Representation: " + p.agency);
    if (p.dream) bits.push("Dream gig: " + p.dream);
    if (p.reel) bits.push("Reel: " + p.reel);
    return bits.join(". ") + ".";
  }

  function offlinePill() { return '<span class="pill">offline</span>'; }

  /* shared mic wiring: tap to start, interim fills box, final sends on tap again or 1.5s silence */
  function wireMic(btn, box, sendFn) {
    if (!btn || !box || !window.BB_VOICE || !window.BB_VOICE.canListen()) { if (btn) btn.hidden = true; return; }
    var listener = null;
    var active = false;
    btn.onclick = function () {
      if (active) {
        if (listener) listener.stop();
        return;
      }
      active = true;
      btn.classList.add("listening");
      listener = window.BB_VOICE.makeListener({
        onInterim: function (text) { box.value = text; },
        onEnd: function (finalText) {
          active = false;
          btn.classList.remove("listening");
          var text = (finalText || box.value || "").trim();
          if (text) sendFn(text);
        }
      });
      listener.start();
    };
  }

  /* ============ router ============ */
  var TABS = ["gigs", "theo", "quiet", "daily"];
  var current = null;
  var renderers = {};

  function go(tab, replace) {
    if (TABS.indexOf(tab) < 0) tab = "gigs";
    current = tab;
    TABS.forEach(function (t) {
      $("#view-" + t).hidden = t !== tab;
      var btn = $('.tab[data-tab="' + t + '"]');
      btn.setAttribute("aria-selected", t === tab ? "true" : "false");
    });
    renderers[tab]();
    try {
      var url = new URL(location.href);
      url.searchParams.set("tab", tab);
      history[replace ? "replaceState" : "pushState"]({ tab: tab }, "", url);
    } catch (e) {}
    window.scrollTo(0, 0);
  }

  /* ================================================================
     TAB 1 - GIGS
     ================================================================ */
  var gigsState = { sub: "results", results: null, offline: false, busy: false, intake: null, radius: "nearby", loc: null, at: null, meOpen: false };
  var RADIUS_OPTS = [
    { key: "nearby", label: "Nearby" },
    { key: "statewide", label: "Statewide" },
    { key: "anywhere", label: "Anywhere I'd travel" }
  ];

  function savedGigs() { return store.get("savedGigs", []); }

  function gigKey(g) { return (g.title || "") + "|" + (g.org || ""); }

  function isSaved(g) {
    return savedGigs().some(function (s) { return gigKey(s) === gigKey(g); });
  }

  function searchUrl(g) {
    var q = [g.org, g.title, "audition"].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    return "https://www.google.com/search?q=" + encodeURIComponent(q);
  }

  function gigCard(g, ctx) {
    var link = safeUrl(g.link);
    var key = gigKey(g);
    var prepRec = store.get("prep", {})[key];
    return '<article class="card">' +
      "<h3>" + esc(g.title || "Opportunity") + "</h3>" +
      '<p class="meta">' + esc([g.org, g.where].filter(Boolean).join(" - ")) + (g.when ? " &middot; " + esc(g.when) : "") + "</p>" +
      (g.why ? "<p>" + esc(g.why) + "</p>" : "") +
      '<div class="card-row">' +
        '<button class="btn small save-gig" data-key="' + esc(key) + '">' + ico("i-heart") + (isSaved(g) ? "Saved" : "Save") + "</button>" +
        '<button class="btn small pitch-gig" data-key="' + esc(key) + '">Draft my pitch</button>' +
        '<button class="btn small ghost prep-gig" data-key="' + esc(key) + '">Prep me</button>' +
        '<button class="btn small ghost cal-gig" data-key="' + esc(key) + '">Add to my calendar</button>' +
        '<a class="btn small ghost" href="' + esc(searchUrl(g)) + '" target="_blank" rel="noopener">Look it up ' + ico("i-out") + "</a>" +
        (link ? '<a class="btn small ghost" href="' + esc(link) + '" target="_blank" rel="noopener">Open ' + ico("i-out") + "</a>" : "") +
      "</div>" +
      '<div class="pitch-slot" data-key="' + esc(key) + '"></div>' +
      '<div class="prep-slot" data-key="' + esc(key) + '">' + (prepRec ? prepKitHtml(prepRec) : "") + "</div>" +
      '<div class="cal-slot" data-key="' + esc(key) + '"></div>' +
      "</article>";
  }

  /* ---- prep kits ---- */
  function buildPrepKit(obj) {
    var items = [];
    if (obj.wear) items.push("Wear: " + obj.wear);
    if (obj.bring) items.push("Bring: " + obj.bring);
    if (obj.style) items.push("Likely style: " + obj.style);
    (obj.rehearse || []).slice(0, 3).forEach(function (r) { if (r) items.push("Rehearse: " + r); });
    (obj.questions || []).slice(0, 2).forEach(function (q) { if (q) items.push("Ask: " + q); });
    if (!items.length) throw new Error("empty kit");
    return { items: items, encouragement: obj.encouragement || "" };
  }

  function parsePrepJson(text) {
    var t = String(text).trim().replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim();
    var a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0 || b < a) throw new Error("no object");
    return buildPrepKit(JSON.parse(t.slice(a, b + 1)));
  }

  function fallbackPrepKit(g) {
    return buildPrepKit({
      wear: "Fitted layers you can move in, camera-ready but not costume-y.",
      bring: "Water, resume with a photo, extra hair ties, and whatever shoes the call specifies.",
      style: g.why ? "Likely close to your usual training style, based on the fit already noted." : "Assume a commercial or jazz-based combo unless the call says otherwise.",
      rehearse: ["A sharp pirouette prep and a clean landing", "A grounded jazz walk across the floor", "One 8-count you can drop into instantly from muscle memory"],
      questions: ["Is there a callback the same day or on a separate date?", "What should I know about the rate and schedule if I book it?"],
      encouragement: "You have already done the work. This is just the room catching up to that."
    });
  }

  function prepKitHtml(rec) {
    return '<div class="card soft" style="margin-top:14px">' +
      (rec.offline ? '<p class="meta" style="margin-bottom:8px">Starter kit ' + offlinePill() + "</p>" : "") +
      '<div class="checklist">' +
      rec.kit.items.map(function (item, i) {
        return '<label class="checkitem"><input type="checkbox" data-i="' + i + '"' + (rec.checked[i] ? " checked" : "") + '><span>' + esc(item) + "</span></label>";
      }).join("") +
      "</div>" +
      (rec.kit.encouragement ? '<p class="fact" style="margin-top:10px">' + esc(rec.kit.encouragement) + "</p>" : "") +
      "</div>";
  }

  function wirePrepChecks(slot, key) {
    $$("input[type=checkbox]", slot).forEach(function (cb) {
      cb.onchange = function () {
        var all = store.get("prep", {});
        var rec = all[key];
        if (!rec) return;
        rec.checked[+cb.dataset.i] = cb.checked;
        store.set("prep", all);
      };
    });
  }

  function prepGig(g, slot) {
    if (!slot) return;
    var key = gigKey(g);
    slot.innerHTML = '<p class="fact">Building your prep kit...</p>';

    function land(kit, off) {
      var all = store.get("prep", {});
      var rec = { kit: kit, checked: kit.items.map(function () { return false; }), offline: off };
      all[key] = rec;
      store.set("prep", all);
      slot.innerHTML = prepKitHtml(rec);
      wirePrepChecks(slot, key);
    }

    if (!hasKey()) { land(fallbackPrepKit(g), true); return; }

    gemini({
      system: D.SYSTEM.prep,
      contents: [{ role: "user", parts: [{ text: "Dancer: " + profileBlurb() + "\nAudition: " + JSON.stringify(g) + "\nWrite the prep kit as JSON only." }] }],
      json: true
    }).then(function (r) { land(parsePrepJson(r.text), false); }).catch(function () { land(fallbackPrepKit(g), true); });
  }

  /* ---- audition calendar ---- */
  function auditions() { return store.get("auditions", []); }

  function toggleCalForm(g, slot) {
    if (!slot) return;
    if (slot.classList.contains("open")) { slot.innerHTML = ""; slot.classList.remove("open"); return; }
    slot.classList.add("open");
    var d0 = today();
    slot.innerHTML = '<div class="card soft" style="margin-top:14px">' +
      '<label class="field"><span>Date</span><input class="cal-date" type="date" value="' + d0 + '"></label>' +
      '<label class="field"><span>Time (optional)</span><input class="cal-time" type="time"></label>' +
      '<label class="field"><span>Place</span><input class="cal-place" placeholder="Where" value="' + esc(g.where || "") + '"></label>' +
      '<label class="field" style="margin-bottom:0"><span>Notes</span><input class="cal-notes" placeholder="Optional"></label>' +
      '<div class="card-row"><button class="btn primary small cal-save">Add to my calendar</button>' +
      '<button class="btn ghost small cal-cancel">Cancel</button></div>' +
      "</div>";
    $(".cal-save", slot).onclick = function () {
      var list = auditions();
      list.push({
        id: Date.now(),
        gigKey: gigKey(g),
        title: g.title || "Audition",
        org: g.org || "",
        date: $(".cal-date", slot).value || d0,
        time: $(".cal-time", slot).value || "",
        place: $(".cal-place", slot).value.trim(),
        notes: $(".cal-notes", slot).value.trim()
      });
      store.set("auditions", list);
      toast("Added to Upcoming");
      slot.innerHTML = "";
      slot.classList.remove("open");
    };
    $(".cal-cancel", slot).onclick = function () { slot.innerHTML = ""; slot.classList.remove("open"); };
  }

  function renderGigs() {
    var v = $("#view-gigs");
    var p = profile();

    if (gigsState.intake) { renderIntake(v); return; }

    if (gigsState.results === null) {
      var last = store.get("gigsLast", null);
      if (last) {
        gigsState.results = last.results;
        gigsState.offline = last.offline;
        gigsState.loc = last.loc;
        gigsState.radius = last.radius || "nearby";
        gigsState.at = last.at;
      }
    }

    var needIntake = !store.get("intakeDone", false) && (!p.height || !p.availability);

    var html = '<div class="stack">';
    html += '<div class="subtabs" id="gigSubs">' +
      '<button class="subtab" data-sub="results" aria-selected="' + (gigsState.sub === "results") + '">Results</button>' +
      '<button class="subtab" data-sub="saved" aria-selected="' + (gigsState.sub === "saved") + '">Saved</button>' +
      '<button class="subtab" data-sub="upcoming" aria-selected="' + (gigsState.sub === "upcoming") + '">Upcoming</button>' +
      "</div>";

    if (gigsState.sub === "saved") {
      var list = savedGigs();
      html += list.length
        ? list.map(function (g) { return gigCard(g, "saved"); }).join("")
        : '<p class="empty">Nothing saved yet. Tap the heart on anything worth chasing.</p>';
      html += "</div>";
      v.innerHTML = html;
      wireGigs(v);
      return;
    }

    if (gigsState.sub === "upcoming") {
      var au = auditions().slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
      html += au.length
        ? '<div class="stack">' + au.map(function (a) {
            return '<article class="card">' +
              "<h3>" + esc(a.title) + "</h3>" +
              '<p class="meta">' + esc([a.org, a.place].filter(Boolean).join(" - ")) + "</p>" +
              '<p class="meta">' + esc(a.date) + (a.time ? " at " + esc(a.time) : "") + ' &middot; <strong style="color:var(--blue)">' + esc(auditionCountdown(a.date)) + "</strong></p>" +
              (a.notes ? "<p>" + esc(a.notes) + "</p>" : "") +
              '<div class="card-row"><button class="btn small ics-dl" data-id="' + a.id + '">' + ico("i-out") + "Download .ics</button>" +
              '<button class="btn small ghost aud-del" data-id="' + a.id + '">Remove</button></div>' +
              "</article>";
          }).join("") + "</div>"
        : '<p class="empty">Nothing on the calendar yet. Add a date from any gig card.</p>';
      html += "</div>";
      v.innerHTML = html;
      wireGigs(v);
      return;
    }

    var bio = store.get("bio", null);
    if (bio) {
      html += '<article class="card baby meCard">' +
        '<button class="me-toggle" id="meToggle" aria-expanded="' + gigsState.meOpen + '"><span>Me</span>' + ico("i-chevron") + "</button>" +
        (gigsState.meOpen
          ? '<div class="me-body"><p style="margin:0 0 10px">' + esc(bio.bio) + "</p>" +
            '<ul class="me-bullets">' + bio.bullets.map(function (b) { return "<li>" + esc(b) + "</li>"; }).join("") + "</ul>" +
            '<button class="btn small copy-bio">' + ico("i-copy") + "Copy</button></div>"
          : "") +
        "</article>";
    }

    if (needIntake) {
      html += '<article class="card baby">' +
        "<h3>Quick intake</h3>" +
        "<p>Five questions and I can actually pitch you. Takes about a minute.</p>" +
        '<div class="card-row"><button class="btn primary" id="startIntake">Start</button>' +
        '<button class="btn ghost" id="skipIntake">Not now</button></div>' +
        "</article>";
    }

    html += '<div>' +
      '<label class="field"><span>Where are you looking</span>' +
      '<input id="gigLoc" value="' + esc(p.city || "Miami, FL") + '" placeholder="City or zip"></label>' +
      '<span class="field" style="display:block"><span style="display:block;font-size:13px;font-weight:800;color:var(--grey);margin-bottom:6px">How far</span>' +
      '<span class="chips" id="radiusChips">' +
        RADIUS_OPTS.map(function (r) {
          return '<button class="chip" data-radius="' + r.key + '" aria-pressed="' + (gigsState.radius === r.key) + '">' + esc(r.label) + "</button>";
        }).join("") +
      "</span></span>" +
      '<span class="field" style="display:block"><span style="display:block;font-size:13px;font-weight:800;color:var(--grey);margin-bottom:6px">What you dance</span>' +
      '<span class="chips" id="styleChips">' +
        D.STYLES.map(function (s) {
          var on = (p.styles || []).indexOf(s) >= 0;
          return '<button class="chip" data-style="' + esc(s) + '" aria-pressed="' + on + '">' + esc(s) + "</button>";
        }).join("") +
      "</span></span>" +
      '<button class="btn primary wide" id="findWork"' + (gigsState.busy ? " disabled" : "") + ">" +
        (gigsState.busy ? "Looking..." : "Find me work") + "</button>" +
      "</div>";

    if (gigsState.results) {
      html += "<div>" +
        '<h2 class="section-title">' + (gigsState.offline ? "Worth chasing " + offlinePill() : "What I found") + "</h2>" +
        (gigsState.loc ? '<p class="meta" style="margin:-4px 0 12px">Searched ' + esc(gigsState.loc) + " &middot; " + esc(relTime(gigsState.at)) + "</p>" : "") +
        '<div class="stack">' + gigsState.results.map(function (g) { return gigCard(g, "results"); }).join("") + "</div>" +
        "</div>";
    }

    html += "<div>" +
      '<h2 class="section-title">Always worth checking</h2>' +
      '<div class="card soft"><div class="links">' +
      D.curatedLinks($("#gigLoc") ? $("#gigLoc").value : p.city).map(function (l) {
        return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.name) + ico("i-out") + "</a>";
      }).join("") +
      "</div></div></div>";

    html += "</div>";
    v.innerHTML = html;
    wireGigs(v);
  }

  function wireGigs(v) {
    $$(".subtab", v).forEach(function (b) {
      b.onclick = function () { gigsState.sub = b.dataset.sub; renderGigs(); };
    });
    var start = $("#startIntake", v);
    if (start) start.onclick = function () { gigsState.intake = { step: 0, answers: {}, log: [] }; renderGigs(); };
    var skip = $("#skipIntake", v);
    if (skip) skip.onclick = function () { store.set("intakeDone", true); renderGigs(); };

    var meToggle = $("#meToggle", v);
    if (meToggle) meToggle.onclick = function () { gigsState.meOpen = !gigsState.meOpen; renderGigs(); };
    var copyBio = $(".copy-bio", v);
    if (copyBio) copyBio.onclick = function () {
      var bio = store.get("bio", null);
      if (bio) copy(bio.bio + "\n\n" + bio.bullets.join("\n"));
    };

    $$(".ics-dl", v).forEach(function (b) {
      b.onclick = function () {
        var a = auditions().filter(function (x) { return String(x.id) === b.dataset.id; })[0];
        if (a && window.BB_ICS) window.BB_ICS.download(a);
      };
    });
    $$(".aud-del", v).forEach(function (b) {
      b.onclick = function () {
        var list = auditions().filter(function (x) { return String(x.id) !== b.dataset.id; });
        store.set("auditions", list);
        renderGigs();
      };
    });

    $$("#radiusChips .chip", v).forEach(function (c) {
      c.onclick = function () { gigsState.radius = c.dataset.radius; renderGigs(); };
    });

    $$("#styleChips .chip", v).forEach(function (c) {
      c.onclick = function () {
        var p = profile();
        var s = c.dataset.style;
        var i = (p.styles || []).indexOf(s);
        if (i >= 0) p.styles.splice(i, 1); else p.styles.push(s);
        saveProfile(p);
        c.setAttribute("aria-pressed", i < 0 ? "true" : "false");
      };
    });

    var loc = $("#gigLoc", v);
    if (loc) loc.onchange = function () {
      var p = profile(); p.city = loc.value.trim(); saveProfile(p); renderGigs();
    };

    var find = $("#findWork", v);
    if (find) find.onclick = findWork;

    $$(".save-gig", v).forEach(function (b) {
      b.onclick = function () {
        var pool = (gigsState.results || []).concat(savedGigs());
        var g = pool.filter(function (x) { return gigKey(x) === b.dataset.key; })[0];
        if (!g) return;
        var list = savedGigs();
        var at = -1;
        list.forEach(function (s, i) { if (gigKey(s) === gigKey(g)) at = i; });
        if (at >= 0) { list.splice(at, 1); toast("Removed"); }
        else { list.push(g); toast("Saved"); }
        store.set("savedGigs", list);
        renderGigs();
      };
    });

    $$(".pitch-gig", v).forEach(function (b) {
      b.onclick = function () {
        var pool = (gigsState.results || []).concat(savedGigs());
        var g = pool.filter(function (x) { return gigKey(x) === b.dataset.key; })[0];
        if (!g) return;
        var slot = $$('.pitch-slot[data-key="' + CSS.escape(b.dataset.key) + '"]', v)[0];
        draftPitch(g, slot);
      };
    });

    $$(".prep-gig", v).forEach(function (b) {
      b.onclick = function () {
        var pool = (gigsState.results || []).concat(savedGigs());
        var g = pool.filter(function (x) { return gigKey(x) === b.dataset.key; })[0];
        if (!g) return;
        var slot = $$('.prep-slot[data-key="' + CSS.escape(b.dataset.key) + '"]', v)[0];
        prepGig(g, slot);
      };
    });

    $$(".cal-gig", v).forEach(function (b) {
      b.onclick = function () {
        var pool = (gigsState.results || []).concat(savedGigs());
        var g = pool.filter(function (x) { return gigKey(x) === b.dataset.key; })[0];
        if (!g) return;
        var slot = $$('.cal-slot[data-key="' + CSS.escape(b.dataset.key) + '"]', v)[0];
        toggleCalForm(g, slot);
      };
    });

    $$(".prep-slot", v).forEach(function (slot) {
      var key = slot.dataset.key;
      var rec = store.get("prep", {})[key];
      if (rec) wirePrepChecks(slot, key);
    });
  }

  function renderIntake(v) {
    var st = gigsState.intake;
    var q = D.INTAKE[st.step];
    var html = '<div class="stack"><div class="thread">';
    html += '<div class="bubble them">Let me get you on paper, ' + esc(firstName()) + ". Five quick ones.</div>";
    st.log.forEach(function (row) {
      html += '<div class="bubble them">' + esc(row.ask) + "</div>";
      html += '<div class="bubble me">' + esc(row.answer) + "</div>";
    });
    if (q) html += '<div class="bubble them">' + esc(q.ask) + "</div>";
    html += "</div>";
    if (q) {
      html += '<div class="chips" id="intakeChips">' +
        q.chips.map(function (c) { return '<button class="chip" data-a="' + esc(c) + '">' + esc(c) + "</button>"; }).join("") +
        "</div>";
      html += '<div class="row-2"><label class="field" style="margin-bottom:0"><span>Or say it your way</span>' +
        '<input id="intakeFree" placeholder="Type an answer"></label>' +
        '<button class="btn primary" id="intakeGo">Next</button></div>';
    } else {
      html += '<button class="btn primary wide" id="intakeDone">Done, take me back</button>';
    }
    html += "</div>";
    v.innerHTML = html;

    function answer(val) {
      val = String(val || "").trim();
      if (!val) return;
      var p = profile();
      p[q.key] = val;
      saveProfile(p);
      st.log.push({ ask: q.ask, answer: val });
      st.step++;
      if (st.step >= D.INTAKE.length) store.set("intakeDone", true);
      renderGigs();
    }
    $$("#intakeChips .chip", v).forEach(function (c) { c.onclick = function () { answer(c.dataset.a); }; });
    var go2 = $("#intakeGo", v);
    if (go2) go2.onclick = function () { answer($("#intakeFree", v).value); };
    var free = $("#intakeFree", v);
    if (free) free.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); answer(free.value); } };
    var done = $("#intakeDone", v);
    if (done) done.onclick = function () { store.set("intakeDone", true); gigsState.intake = null; renderGigs(); };
  }

  function parseGigJson(text) {
    var t = String(text).trim();
    t = t.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim();
    var a = t.indexOf("["), b = t.lastIndexOf("]");
    if (a < 0 || b < a) throw new Error("no array");
    var arr = JSON.parse(t.slice(a, b + 1));
    if (!Array.isArray(arr) || !arr.length) throw new Error("empty array");
    return arr.filter(function (o) { return o && o.title; }).slice(0, 10);
  }

  var RADIUS_PHRASE = {
    nearby: "within a reasonable local driving distance of",
    statewide: "anywhere within the same state as",
    anywhere: "anywhere in the US or beyond that she would be willing to travel to, starting from"
  };

  function findWork() {
    var p = profile();
    var loc = ($("#gigLoc") && $("#gigLoc").value.trim()) || p.city || "Miami, FL";
    p.city = loc; saveProfile(p);
    gigsState.busy = true; renderGigs();

    function persist() {
      gigsState.loc = loc;
      gigsState.at = Date.now();
      store.set("gigsLast", {
        loc: gigsState.loc, radius: gigsState.radius,
        results: gigsState.results, offline: gigsState.offline, at: gigsState.at
      });
    }

    function fallback() {
      gigsState.results = D.GIGS_FALLBACK;
      gigsState.offline = true;
      gigsState.busy = false;
      persist();
      renderGigs();
    }

    if (!hasKey()) { setTimeout(fallback, 250); return; }

    var zipMatch = /^\d{5}$/.test(loc);
    var locDesc = zipMatch ? "zip " + loc + " (USA)" : loc;
    var radiusPhrase = RADIUS_PHRASE[gigsState.radius] || RADIUS_PHRASE.nearby;

    var ask = "Dancer profile: " + profileBlurb() +
      " Find opportunities " + radiusPhrase + " " + locDesc + " for these styles: " +
      ((p.styles && p.styles.join(", ")) || "contemporary, jazz, commercial") + ".";

    var req = { system: D.SYSTEM.gigs, contents: [{ role: "user", parts: [{ text: ask }] }] };
    gemini(Object.assign({ tools: [{ google_search: {} }] }, req)).catch(function () {
      // grounding is quota-limited on free keys; retry from the model's own knowledge, no tool talk
      return gemini({
        system: D.SYSTEM.gigs.replace("Use search to ground every item in", "Draw on what you know to ground every item in"),
        contents: req.contents,
        json: true
      });
    }).then(function (res) {
      var arr = parseGigJson(res.text);
      var chunks = (res.grounding && res.grounding.groundingChunks) || [];
      arr.forEach(function (g, i) {
        // model-invented URLs go stale or 404; keep a link only when Google grounding supplied it
        g.link = (chunks[i] && chunks[i].web && chunks[i].web.uri) ? chunks[i].web.uri : "";
      });
      gigsState.results = arr;
      gigsState.offline = false;
      gigsState.busy = false;
      persist();
      renderGigs();
    }).catch(fallback);
  }

  function draftPitch(g, slot) {
    if (!slot) return;
    slot.innerHTML = '<div class="chips" style="margin-top:14px">' +
      '<button class="chip tone-chip" data-tone="warm" aria-pressed="true">Warm</button>' +
      '<button class="chip tone-chip" data-tone="crisp" aria-pressed="false">Crisp</button>' +
      "</div><div class=\"pitch-out\"></div>";
    wireToneChips(slot, g);
    generatePitch(g, slot, "warm");
  }

  function wireToneChips(slot, g) {
    $$(".tone-chip", slot).forEach(function (c) {
      c.onclick = function () {
        $$(".tone-chip", slot).forEach(function (x) { x.setAttribute("aria-pressed", x === c ? "true" : "false"); });
        generatePitch(g, slot, c.dataset.tone);
      };
    });
  }

  function generatePitch(g, slot, tone) {
    var out = $(".pitch-out", slot);
    if (!out) return;
    out.innerHTML = '<p class="fact">Writing...</p>';
    var p = profile();
    var bio = store.get("bio", null);

    function show(text, off) {
      out.innerHTML = '<div class="card soft" style="margin-top:10px">' +
        (off ? '<p class="meta" style="margin-bottom:8px">Starter draft ' + offlinePill() + "</p>" : "") +
        "<p style=\"white-space:pre-wrap;margin-bottom:12px\">" + esc(text) + "</p>" +
        '<button class="btn small copy-pitch">' + ico("i-copy") + "Copy</button></div>";
      var cbtn = $(".copy-pitch", out);
      cbtn.onclick = function () {
        copy(text);
        cbtn.innerHTML = ico("i-check") + "Copied";
        setTimeout(function () { cbtn.innerHTML = ico("i-copy") + "Copy"; }, 1500);
      };
    }

    var scripted = tone === "crisp"
      ? [
          (p.name || "Gabby") + ", dancer based in " + (p.city || "Miami, FL") + ", writing about " + (g.title || "your current call") + " at " + (g.org || "your company") + ".",
          "Trained in " + ((p.styles && p.styles.join(", ")) || "contemporary, jazz and commercial") + (p.height ? ", " + p.height : "") + ".",
          "Available and ready to audition or submit materials.",
          p.reel ? "Reel: " + p.reel : "Thank you."
        ].join("\n")
      : [
          "Hi, my name is " + (p.name || "Gabby") + ", a dancer based in " + (p.city || "Miami, FL") + ", and I am reaching out about " + (g.title || "your current call") + " at " + (g.org || "your company") + ".",
          "I train and work in " + ((p.styles && p.styles.join(", ")) || "contemporary, jazz and commercial") + (p.height ? ", and I am " + p.height : "") + ".",
          "I would love to be considered, or to know when your next audition is.",
          "Thank you for your time." + (p.reel ? " Reel: " + p.reel : "")
        ].join("\n");

    if (!hasKey()) { show(scripted, true); return; }

    var toneNote = tone === "crisp"
      ? " Tone: crisp and efficient, no warmth padding, get straight to the point."
      : " Tone: warm and personable while staying professional.";
    var bioLine = bio && bio.bio ? ("\nHer bio: " + bio.bio) : "";

    gemini({
      system: D.SYSTEM.pitch + toneNote,
      contents: [{ role: "user", parts: [{ text: "Dancer: " + profileBlurb() + bioLine + "\nOpportunity: " + JSON.stringify(g) + "\nWrite the four-line message." }] }]
    }).then(function (r) { show(r.text, false); }).catch(function () { show(scripted, true); });
  }

  renderers.gigs = renderGigs;

  /* ================================================================
     TAB 2 - THEO
     ================================================================ */
  var theoState = { typing: false, drawer: false, offline: false, listening: false };

  function voiceOn(key) { return !!store.get(key, false); }

  function theoChat() { return store.get("theoChat", []); }
  function setTheoChat(v) { store.set("theoChat", v.slice(-120)); }

  function dailyNote() {
    var i = hash("note" + today()) % D.THEO_NOTES.length;
    return D.THEO_NOTES[i].replace(/\{name\}/g, firstName());
  }

  function scriptedTheo(text) {
    var t = String(text || "").toLowerCase();
    var pool = D.THEO_REPLIES.filter(function (r) {
      return r.keys.length && r.keys.some(function (k) { return t.indexOf(k) >= 0; });
    });
    if (!pool.length) pool = D.THEO_REPLIES.filter(function (r) { return !r.keys.length; });
    var pick = pool[hash(t + theoChat().length) % pool.length];
    return pick.text.replace(/\{name\}/g, firstName());
  }

  function renderTheo() {
    var v = $("#view-theo");
    var chat = theoChat();
    var keeps = store.get("keepsakes", []);
    var noteKept = store.get("noteKept", {});
    var note = dailyNote();

    if (theoState.drawer === "memory") {
      var mem = store.get("theoMemory", []);
      v.innerHTML = '<div class="stack">' +
        '<div class="card-row" style="margin-top:0"><button class="btn small ghost" id="backTheo">' + ico("i-back") + "Back</button></div>" +
        '<h2 class="section-title">What Theo knows</h2>' +
        (mem.length
          ? '<div class="stack">' + mem.map(function (line, i) {
              return '<article class="card soft" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px">' +
                '<p style="margin:0;flex:1">' + esc(line) + '</p>' +
                '<button class="btn small ghost drop-mem" data-i="' + i + '" aria-label="Forget this">' + ico("i-close") + "</button></article>";
            }).join("") + "</div>"
          : '<p class="empty">Theo has not kept anything yet. Tell it something below and it will remember.</p>') +
        '<div class="composer" style="position:static;background:none;padding:0">' +
        '<textarea id="memInput" rows="1" placeholder="Tell Theo something to remember"></textarea>' +
        '<button class="send" id="memSend" aria-label="Save">' + ico("i-check") + "</button></div>" +
        "</div>";
      $("#backTheo", v).onclick = function () { theoState.drawer = false; renderTheo(); };
      $$(".drop-mem", v).forEach(function (b) {
        b.onclick = function () {
          var list = store.get("theoMemory", []);
          list.splice(+b.dataset.i, 1);
          store.set("theoMemory", list);
          renderTheo();
        };
      });
      function addMem() {
        var box = $("#memInput", v);
        var text = box.value.trim();
        if (!text) return;
        var list = store.get("theoMemory", []);
        if (list.indexOf(text) < 0) list.push(text);
        store.set("theoMemory", list.slice(-40));
        toast("Theo will remember that");
        renderTheo();
      }
      $("#memSend", v).onclick = addMem;
      $("#memInput", v).onkeydown = function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addMem(); } };
      return;
    }

    if (theoState.drawer === "keeps") {
      v.innerHTML = '<div class="stack">' +
        '<div class="card-row" style="margin-top:0"><button class="btn small ghost" id="backTheo">' + ico("i-back") + "Back</button></div>" +
        '<h2 class="section-title">Keepsakes</h2>' +
        (keeps.length
          ? '<div class="stack">' + keeps.map(function (k, i) {
              return '<article class="card"><p style="margin:0">' + esc(k.text) + '</p><p class="meta" style="margin-top:8px">' + esc(k.date) + '</p>' +
                '<div class="card-row"><button class="btn small ghost drop-keep" data-i="' + i + '">Remove</button></div></article>';
            }).join("") + "</div>"
          : '<p class="empty">Nothing kept yet. Press and hold one of Theo\'s messages to keep it.</p>') +
        "</div>";
      $("#backTheo", v).onclick = function () { theoState.drawer = false; renderTheo(); };
      $$(".drop-keep", v).forEach(function (b) {
        b.onclick = function () {
          var list = store.get("keepsakes", []);
          list.splice(+b.dataset.i, 1);
          store.set("keepsakes", list);
          renderTheo();
        };
      });
      return;
    }

    var speakOn = voiceOn("theoVoice");
    var canSpeak = window.BB_VOICE && window.BB_VOICE.canSpeak();
    var html = '<div class="stack chat-view">';
    if (canSpeak) {
      html += '<div class="card-row" style="margin-top:0;justify-content:flex-end">' +
        '<button class="btn small ghost" id="theoVoiceToggle" aria-pressed="' + speakOn + '">' +
        ico(speakOn ? "i-speaker" : "i-speaker-off") + (speakOn ? "Theo reads aloud" : "Theo reads aloud: off") +
        "</button></div>";
    }
    var isSunday = new Date().getDay() === 0;
    var sundayLetters = store.get("sundayLetter", {});
    var sundayText = isSunday ? sundayLetters[today()] : null;
    var noteLabel = isSunday ? "Your Sunday letter, from Theo" : "Today, from Theo";
    var noteBody = isSunday ? (sundayText || "Writing your Sunday letter...") : note;

    html += '<article class="card baby">' +
      '<p class="meta" style="margin-bottom:6px">' + esc(noteLabel) + "</p>" +
      '<p style="margin:0;font-family:Fraunces,Georgia,serif;font-size:19px;line-height:1.45;color:var(--deep);white-space:pre-wrap">' + esc(noteBody) + "</p>" +
      '<div class="card-row"><button class="btn small" id="keepNote">' + ico("i-heart") + (noteKept[today()] ? "Kept" : "Keep this") + "</button>" +
      '<button class="btn small ghost" id="openKeeps">Keepsakes (' + keeps.length + ")</button>" +
      '<button class="btn small ghost" id="openMemory">' + ico("i-book") + "What Theo knows</button></div>" +
      "</article>";

    html += '<div class="thread" id="theoThread">';
    if (!chat.length) {
      html += '<div class="bubble them warm">Hey ' + esc(firstName()) + ". I am glad you are here. How was today?</div>";
    }
    chat.forEach(function (m, i) {
      var kept = keeps.some(function (k) { return k.text === m.text; });
      if (m.role === "me") {
        html += '<div class="bubble me" data-i="' + i + '">' + esc(m.text) + "</div>";
      } else {
        html += '<div class="bubble-row"><div class="bubble them warm' + (kept ? " saved" : "") + '" data-i="' + i + '">' + esc(m.text) + "</div>" +
          '<button class="keep-btn' + (kept ? " on" : "") + '" data-i="' + i + '" aria-label="Keep this message">' + ico("i-heart") + "</button></div>";
      }
    });
    if (theoState.typing) html += '<div class="typing"><i></i><i></i><i></i></div>';
    html += "</div>";

    if (theoState.offline) html += '<div class="offrow">' + offlinePill() + "</div>";

    html += '<div class="chips" id="theoChips">' +
      ["I had a hard day", "Hype me up", "Tell me something sweet", "I nailed it today"].map(function (c) {
        return '<button class="chip" data-c="' + esc(c) + '">' + esc(c) + "</button>";
      }).join("") + "</div>";

    var canListen = window.BB_VOICE && window.BB_VOICE.canListen();
    html += '<div class="composer">' +
      (canListen ? '<button class="mic' + (theoState.listening ? " listening" : "") + '" id="theoMic" aria-label="Speak your message">' + ico("i-mic") + "</button>" : "") +
      '<textarea id="theoInput" rows="1" placeholder="Tell Theo something"></textarea>' +
      '<button class="send" id="theoSend" aria-label="Send">' + ico("i-send", "fill") + "</button></div>";
    html += "</div>";
    v.innerHTML = html;

    if (canSpeak) {
      $("#theoVoiceToggle", v).onclick = function () {
        store.set("theoVoice", !speakOn);
        renderTheo();
      };
    }
    if (canListen) wireMic($("#theoMic", v), $("#theoInput", v), sendTheo);

    $("#openKeeps", v).onclick = function () { theoState.drawer = "keeps"; renderTheo(); };
    $("#openMemory", v).onclick = function () { theoState.drawer = "memory"; renderTheo(); };
    $("#keepNote", v).onclick = function () {
      var nk = store.get("noteKept", {});
      var keeps2 = store.get("keepsakes", []);
      if (nk[today()]) {
        delete nk[today()];
        keeps2 = keeps2.filter(function (k) { return k.text !== noteBody; });
        toast("Removed");
      } else {
        nk[today()] = true;
        keeps2.push({ text: noteBody, date: today() });
        toast("Kept");
      }
      store.set("noteKept", nk);
      store.set("keepsakes", keeps2);
      renderTheo();
    };
    $$("#theoChips .chip", v).forEach(function (c) { c.onclick = function () { sendTheo(c.dataset.c); }; });
    $("#theoSend", v).onclick = function () {
      var box = $("#theoInput", v);
      sendTheo(box.value);
    };
    var box = $("#theoInput", v);
    box.onkeydown = function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendTheo(box.value); }
    };
    wireLongPress($("#theoThread", v));
    $$(".keep-btn", v).forEach(function (b) {
      b.onclick = function () {
        var m = chat[+b.dataset.i];
        if (!m) return;
        var list = store.get("keepsakes", []);
        var at = -1;
        list.forEach(function (k, idx) { if (k.text === m.text) at = idx; });
        if (at >= 0) { list.splice(at, 1); toast("Removed"); }
        else { list.push({ text: m.text, date: today() }); toast("Kept"); }
        store.set("keepsakes", list);
        renderTheo();
      };
    });
    var focusables = $$("#theoInput", v);
    focusables.forEach(function (el) { el.addEventListener("focus", function () { setTimeout(scrollThread, 300); }); });
    scrollThread();

    if (isSunday && !sundayText) fetchSundayLetter();
  }

  function fallbackSundayLetter() {
    var m = moods().slice(-7);
    var bit = m.length
      ? "I noticed your week had some " + m.map(function (x) { return x.mood; }).join(", ") + " days in it. All of it counts."
      : "I do not have much logged from this week, and that is fine too.";
    return "Sunday, " + firstName() + ".\n\nAnother week down. " + bit + " Whatever this week asked of you, you showed up for most of it, and that is the only scoreboard that matters.\n\nTake something slow today if you can. Next week will still be there tomorrow.\n\nTheo";
  }

  function fetchSundayLetter() {
    var d8 = today();
    var mem = store.get("theoMemory", []);
    var recentMoods = moods().slice(-7).map(function (x) { return x.date + ": " + x.mood + (x.note ? " (" + x.note + ")" : ""); }).join("; ");

    function land(text) {
      var letters = store.get("sundayLetter", {});
      letters[d8] = text;
      store.set("sundayLetter", letters);
      if (theoState.drawer === false || theoState.drawer === undefined) renderTheo();
    }

    if (!hasKey()) { land(fallbackSundayLetter()); return; }

    var sys = D.SYSTEM.sunday + "\nAbout her: " + profileBlurb() +
      (mem.length ? "\nThings you remember: " + mem.join("; ") : "") +
      (recentMoods ? "\nHer mood check-ins this week: " + recentMoods : "");

    gemini({ system: sys, contents: [{ role: "user", parts: [{ text: "Write today's Sunday letter." }] }] })
      .then(function (r) { land(r.text); })
      .catch(function () { land(fallbackSundayLetter()); });
  }

  function wireLongPress(thread) {
    if (!thread) return;
    $$(".bubble.them", thread).forEach(function (b) {
      var timer;
      function keep() {
        var list = store.get("keepsakes", []);
        var txt = b.textContent;
        if (list.some(function (k) { return k.text === txt; })) { toast("Already kept"); return; }
        list.push({ text: txt, date: today() });
        store.set("keepsakes", list);
        b.classList.add("saved");
        toast("Saved to keepsakes");
      }
      b.addEventListener("pointerdown", function () { timer = setTimeout(keep, 550); });
      ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) {
        b.addEventListener(ev, function () { clearTimeout(timer); });
      });
      b.addEventListener("contextmenu", function (e) { e.preventDefault(); keep(); });
    });
  }

  function scrollThread() {
    window.requestAnimationFrame(function () {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    });
  }

  function sendTheo(text) {
    text = String(text || "").trim();
    if (!text) return;
    var chat = theoChat();
    chat.push({ role: "me", text: text });
    setTheoChat(chat);
    theoState.typing = true;
    renderTheo();

    function land(reply, off) {
      var mem = /<mem>([\s\S]*?)<\/mem>/i.exec(reply);
      if (mem) {
        var lines = store.get("theoMemory", []);
        var fact = mem[1].trim();
        if (fact && lines.indexOf(fact) < 0) { lines.push(fact); store.set("theoMemory", lines.slice(-40)); }
        reply = reply.replace(/<mem>[\s\S]*?<\/mem>/gi, "").trim();
      }
      var c = theoChat();
      c.push({ role: "them", text: reply });
      setTheoChat(c);
      theoState.typing = false;
      theoState.offline = !!off;
      renderTheo();
      if (voiceOn("theoVoice") && window.BB_VOICE) window.BB_VOICE.speak(reply);
    }

    var delay = 600 + Math.random() * 500;
    if (!hasKey()) { setTimeout(function () { land(scriptedTheo(text), true); }, delay); return; }

    var mem = store.get("theoMemory", []);
    var sys = D.SYSTEM.theo + "\nAbout her: " + profileBlurb() +
      (mem.length ? "\nThings you remember: " + mem.join("; ") : "");

    gemini({ system: sys, contents: turns(theoChat()) })
      .then(function (r) { setTimeout(function () { land(r.text, false); }, 250); })
      .catch(function () { setTimeout(function () { land(scriptedTheo(text), true); }, 300); });
  }

  renderers.theo = renderTheo;

  /* ================================================================
     TAB 3 - QUIET ROOM
     ================================================================ */
  var quietState = { typing: false, view: "room", offline: false, crisis: false };

  function moods() { return store.get("moods", []); }
  function quietChat() { return store.get("quietChat", []); }
  function setQuietChat(v) { store.set("quietChat", v.slice(-120)); }

  function moodFace(key, size) {
    var s = size || 36;
    var mouths = {
      rough: "M10 25c2.6-3.4 9.4-3.4 12 0",
      low: "M10 24c2.6-1.8 9.4-1.8 12 0",
      okay: "M10.5 23.5h11",
      good: "M10 22c2.6 2.2 9.4 2.2 12 0",
      great: "M9.5 21c3 4 9 4 13 0"
    };
    return '<svg viewBox="0 0 32 32" width="' + s + '" height="' + s + '">' +
      '<circle cx="16" cy="16" r="13"/>' +
      '<circle cx="11.5" cy="13" r="1.1" fill="currentColor" stroke="none" style="fill:var(--blue)"/>' +
      '<circle cx="20.5" cy="13" r="1.1" fill="currentColor" stroke="none" style="fill:var(--blue)"/>' +
      '<path d="' + mouths[key] + '"/></svg>';
  }

  function moodStrip() {
    var m = moods();
    var scale = { rough: 1, low: 2, okay: 3, good: 4, great: 5 };
    var out = "";
    for (var i = 13; i >= 0; i--) {
      var d = dayOffset(-i);
      var row = null;
      m.forEach(function (x) { if (x.date === d) row = x; });
      if (!row) out += '<span class="off" title="' + d + '"></span>';
      else {
        var h = 10 + (scale[row.mood] || 3) * 7;
        out += '<span style="height:' + h + "px;opacity:" + (0.35 + (scale[row.mood] || 3) * 0.13) + '" title="' + d + " " + row.mood + '"></span>';
      }
    }
    return '<div class="strip">' + out + "</div>";
  }

  var QUIET_KEYS = [
    { keys: ["audition", "anxious", "nervous", "scared"], idx: [2, 0, 9] },
    { keys: ["compare", "comparing", "behind", "everyone else"], idx: [3, 8, 10] },
    { keys: ["exhaust", "tired", "drained", "burn"], idx: [4, 12, 17] },
    { keys: ["grow", "better", "improve", "stuck"], idx: [5, 9, 15] },
    { keys: ["alone", "lonely", "nobody"], idx: [6, 7, 18] },
    { keys: ["body", "weight", "mirror", "look"], idx: [16, 10, 14] }
  ];
  function scriptedQuiet(text) {
    var t = String(text || "").toLowerCase();
    var pool = null;
    QUIET_KEYS.forEach(function (row) {
      if (!pool && row.keys.some(function (k) { return t.indexOf(k) >= 0; })) pool = row.idx;
    });
    if (pool) return D.QUIET_REPLIES[pool[hash(t + quietChat().length) % pool.length]];
    return D.QUIET_REPLIES[hash(t + quietChat().length) % D.QUIET_REPLIES.length];
  }

  function isCrisis(text) {
    var t = String(text || "").toLowerCase();
    return D.CRISIS_WORDS.some(function (w) { return t.indexOf(w) >= 0; });
  }

  function crisisCard() {
    return '<div class="crisis" id="crisisCard">' +
      "<h3>Let's pause here</h3>" +
      "<p>What you just said matters, and this is bigger than a chat window. You should not be alone with it right now.</p>" +
      "<p>In the US you can call or text <strong>988</strong> any hour, any day, and reach a real person at the Suicide and Crisis Lifeline. If you are in immediate danger, call 911.</p>" +
      '<a class="btn primary" href="tel:988">Call 988</a>' +
      "</div>";
  }

  function renderQuiet() {
    var v = $("#view-quiet");

    if (quietState.view === "journal") { renderJournal(v); return; }
    if (quietState.view === "weekly") { renderWeekly(v); return; }

    var m = moods();
    var todayMood = null;
    m.forEach(function (x) { if (x.date === today()) todayMood = x; });
    var chat = quietChat();

    var speakOnQ = voiceOn("quietVoice");
    var canSpeakQ = window.BB_VOICE && window.BB_VOICE.canSpeak();
    var html = '<div class="stack chat-view">';
    html += '<div class="card soft">' +
      '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:12px">' +
        '<h2 class="section-title" style="margin:0">How are you today?</h2>' +
        '<div class="card-row" style="margin-top:0">' +
        (canSpeakQ ? '<button class="btn small ghost" id="quietVoiceToggle" aria-pressed="' + speakOnQ + '">' + ico(speakOnQ ? "i-speaker" : "i-speaker-off") + "</button>" : "") +
        '<button class="btn small ghost" id="openJournal">' + ico("i-book") + "Journal</button>" +
        "</div>" +
      "</div>" +
      '<div class="moods" id="moodRow">' +
        D.MOODS.map(function (mo) {
          return '<button class="mood" data-m="' + mo.key + '" aria-pressed="' + (todayMood && todayMood.mood === mo.key) + '">' +
            moodFace(mo.key) + "<span>" + mo.label + "</span></button>";
        }).join("") +
      "</div>" +
      '<label class="field" style="margin:16px 0 0"><span>What is on your mind</span>' +
      '<input id="moodNote" placeholder="One line, if you want" value="' + esc(todayMood ? todayMood.note : "") + '"></label>' +
      '<div style="margin-top:18px">' + moodStrip() +
      '<p class="meta" style="margin:8px 0 0">Last 14 days</p></div>' +
      "</div>";

    var wins = store.get("wins", []);
    html += '<article class="card soft winsjar">' +
      '<h2 class="section-title" style="margin-bottom:10px">Wins jar</h2>' +
      '<div class="composer" style="position:static;background:none;padding:0 0 12px">' +
      '<input id="winInput" placeholder="Drop a win, one line" style="flex:1;min-height:46px;padding:11px 15px;border-radius:23px;border:1px solid rgba(74,120,168,.22);background:var(--white)">' +
      '<button class="send" id="winAdd" aria-label="Add win">' + ico("i-check") + "</button></div>" +
      (wins.length
        ? '<div class="chips">' + wins.slice(-16).reverse().map(function (w, i) {
            return '<button class="chip win-chip" data-i="' + (wins.length - 1 - i) + '" aria-label="Remove this win">' + esc(w.text) + "</button>";
          }).join("") + "</div>"
        : '<p class="empty">Drop something small that went right today. It counts.</p>') +
      '<div class="card-row"><button class="btn small ghost" id="weeklyBtn">' + ico("i-book") + "This week</button></div>" +
      "</article>";

    html += '<div class="thread" id="quietThread">';
    if (!chat.length) {
      html += '<div class="bubble them calm">This room is slow on purpose. Start anywhere, and take your time.</div>';
    }
    chat.forEach(function (msg) {
      html += '<div class="bubble ' + (msg.role === "me" ? "me" : "them calm") + '">' + esc(msg.text) + "</div>";
    });
    if (quietState.typing) html += '<div class="typing" style="background:var(--mist)"><i></i><i></i><i></i></div>';
    html += "</div>";

    if (quietState.crisis) html += crisisCard();
    if (quietState.offline) html += '<div class="offrow">' + offlinePill() + "</div>";

    html += '<div class="chips" id="quietChips">' +
      ["I'm anxious about an audition", "I compared myself again", "I'm exhausted", "I want to grow"].map(function (c) {
        return '<button class="chip" data-c="' + esc(c) + '">' + esc(c) + "</button>";
      }).join("") + "</div>";

    var canListenQ = window.BB_VOICE && window.BB_VOICE.canListen();
    html += '<div class="composer">' +
      (canListenQ ? '<button class="mic" id="quietMic" aria-label="Speak your message">' + ico("i-mic") + "</button>" : "") +
      '<textarea id="quietInput" rows="1" placeholder="Say it however it comes out"></textarea>' +
      '<button class="send" id="quietSend" aria-label="Send">' + ico("i-send", "fill") + "</button></div>";
    html += "</div>";
    v.innerHTML = html;

    if (canSpeakQ) $("#quietVoiceToggle", v).onclick = function () { store.set("quietVoice", !speakOnQ); renderQuiet(); };
    if (canListenQ) wireMic($("#quietMic", v), $("#quietInput", v), sendQuiet);

    $("#openJournal", v).onclick = function () { quietState.view = "journal"; renderQuiet(); };
    $("#weeklyBtn", v).onclick = function () { quietState.view = "weekly"; renderQuiet(); };
    $("#winAdd", v).onclick = function () {
      var box = $("#winInput", v);
      var text = box.value.trim();
      if (!text) return;
      var list = store.get("wins", []);
      list.push({ date: today(), text: text });
      store.set("wins", list.slice(-200));
      toast("Dropped in the jar");
      renderQuiet();
    };
    var winBox = $("#winInput", v);
    winBox.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); $("#winAdd", v).click(); } };
    $$(".win-chip", v).forEach(function (chip) {
      chip.onclick = function () {
        var list = store.get("wins", []);
        list.splice(+chip.dataset.i, 1);
        store.set("wins", list);
        renderQuiet();
      };
    });
    $$("#moodRow .mood", v).forEach(function (b) {
      b.onclick = function () {
        var list = moods().filter(function (x) { return x.date !== today(); });
        list.push({ date: today(), mood: b.dataset.m, note: $("#moodNote", v).value.trim() });
        store.set("moods", list);
        toast("Logged");
        renderQuiet();
      };
    });
    var mn = $("#moodNote", v);
    mn.onchange = function () {
      var list = moods();
      var found = false;
      list.forEach(function (x) { if (x.date === today()) { x.note = mn.value.trim(); found = true; } });
      if (!found) list.push({ date: today(), mood: "okay", note: mn.value.trim() });
      store.set("moods", list);
    };
    $$("#quietChips .chip", v).forEach(function (c) { c.onclick = function () { sendQuiet(c.dataset.c); }; });
    $("#quietSend", v).onclick = function () { sendQuiet($("#quietInput", v).value); };
    var box = $("#quietInput", v);
    box.onkeydown = function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendQuiet(box.value); } };
    box.addEventListener("focus", function () { setTimeout(scrollThread, 300); });
    scrollThread();
  }

  function sendQuiet(text) {
    text = String(text || "").trim();
    if (!text) return;
    var chat = quietChat();
    chat.push({ role: "me", text: text });
    setQuietChat(chat);

    if (isCrisis(text)) {
      chat.push({ role: "them", text: "I am really glad you told me. I want to stop and make sure you are safe before anything else." });
      setQuietChat(chat);
      quietState.crisis = true;
      quietState.typing = false;
      renderQuiet();
      return;
    }

    quietState.typing = true;
    renderQuiet();

    function land(reply, off) {
      var c = quietChat();
      c.push({ role: "them", text: reply });
      setQuietChat(c);
      quietState.typing = false;
      quietState.offline = !!off;
      renderQuiet();
      if (voiceOn("quietVoice") && window.BB_VOICE) window.BB_VOICE.speak(reply);
    }

    if (!hasKey()) { setTimeout(function () { land(scriptedQuiet(text), true); }, 900); return; }

    var recent = moods().slice(-5).map(function (x) { return x.date + ": " + x.mood; }).join(", ");
    var sys = D.SYSTEM.quiet + "\nAbout her: " + profileBlurb() + (recent ? "\nRecent mood check-ins: " + recent : "");
    gemini({ system: sys, contents: turns(quietChat()) })
      .then(function (r) { setTimeout(function () { land(r.text, false); }, 400); })
      .catch(function () { setTimeout(function () { land(scriptedQuiet(text), true); }, 500); });
  }

  function lastNDays(n) {
    var out = [];
    for (var i = n - 1; i >= 0; i--) out.push(dayOffset(-i));
    return out;
  }

  function fallbackWeekly() {
    var days = lastNDays(7);
    var m = moods().filter(function (x) { return days.indexOf(x.date) >= 0; });
    var j = store.get("journal", {});
    var jCount = days.filter(function (d) { return j[d] && j[d].trim(); }).length;
    var w = store.get("wins", []).filter(function (x) { return days.indexOf(x.date) >= 0; });
    var lines = [];
    lines.push(m.length ? "You checked in " + m.length + " of the last 7 days." : "You did not log a mood this week, and that is okay.");
    lines.push(jCount ? "You wrote in your journal " + jCount + " time" + (jCount === 1 ? "" : "s") + "." : "No journal entries this week.");
    lines.push(w.length ? "You dropped " + w.length + " win" + (w.length === 1 ? "" : "s") + " in the jar, including: " + w[w.length - 1].text + "." : "No wins logged, but a quiet week still counts.");
    lines.push("Whatever showed up, you kept coming back to check in with yourself.");
    lines.push("Next week, try naming one small thing before you close the app each night.");
    return lines.join("\n");
  }

  function renderWeekly(v) {
    var cached = store.get("weeklyReflection", {});
    var cachedThisWeek = cached.date === today() ? cached.text : null;
    var html = '<div class="stack">' +
      '<div class="card-row" style="margin-top:0"><button class="btn small ghost" id="backQuiet">' + ico("i-back") + "Back</button></div>" +
      '<h2 class="section-title">This week</h2>' +
      '<article class="card soft" id="weeklySlot">' +
      (cachedThisWeek
        ? '<p style="margin:0;white-space:pre-wrap;line-height:1.6">' + esc(cachedThisWeek) + "</p>"
        : '<p class="meta">A short reflection built from your last 7 days of moods, journal entries and wins.</p>' +
          '<div class="card-row"><button class="btn primary" id="buildWeekly">Build my reflection</button></div>') +
      "</article></div>";
    v.innerHTML = html;
    $("#backQuiet", v).onclick = function () { quietState.view = "room"; renderQuiet(); };
    var buildBtn = $("#buildWeekly", v);
    if (buildBtn) buildBtn.onclick = function () {
      buildBtn.disabled = true;
      buildBtn.textContent = "Writing...";
      var days = lastNDays(7);
      var m = moods().filter(function (x) { return days.indexOf(x.date) >= 0; }).map(function (x) { return x.date + ": " + x.mood; }).join("; ");
      var j = store.get("journal", {});
      var jTexts = days.filter(function (d) { return j[d] && j[d].trim(); }).map(function (d) { return j[d]; }).join(" / ");
      var w = store.get("wins", []).filter(function (x) { return days.indexOf(x.date) >= 0; }).map(function (x) { return x.text; }).join("; ");

      function land(text) {
        store.set("weeklyReflection", { date: today(), text: text });
        renderWeekly(v);
      }

      if (!hasKey()) { setTimeout(function () { land(fallbackWeekly()); }, 400); return; }

      gemini({
        system: D.SYSTEM.weekly,
        contents: [{ role: "user", parts: [{ text: "Mood check-ins: " + (m || "none logged") + "\nJournal snippets: " + (jTexts || "none") + "\nWins logged: " + (w || "none") + "\nWrite the 5-line reflection." }] }]
      }).then(function (r) { land(r.text); }).catch(function () { land(fallbackWeekly()); });
    };
  }

  function renderJournal(v) {
    var entries = store.get("journal", {});
    var dates = Object.keys(entries).sort().reverse();
    var html = '<div class="stack">' +
      '<div class="card-row" style="margin-top:0"><button class="btn small ghost" id="backQuiet">' + ico("i-back") + "Back</button></div>" +
      '<div><h2 class="section-title">Today, ' + esc(today()) + "</h2>" +
      '<label class="field"><span>Journal</span><textarea id="journalBox" placeholder="No prompt. Just write.">' + esc(entries[today()] || "") + "</textarea></label>" +
      '<p class="meta" id="saveHint">Saves as you type.</p></div>';
    var older = dates.filter(function (d) { return d !== today(); });
    if (older.length) {
      html += '<div><h2 class="section-title">Earlier</h2><div class="stack">' +
        older.map(function (d) {
          return '<article class="card soft"><p class="meta" style="margin-bottom:6px">' + esc(d) + "</p>" +
            '<p style="margin:0;white-space:pre-wrap">' + esc(entries[d]) + "</p></article>";
        }).join("") + "</div></div>";
    }
    html += "</div>";
    v.innerHTML = html;
    $("#backQuiet", v).onclick = function () { quietState.view = "room"; renderQuiet(); };
    var box = $("#journalBox", v);
    var t;
    box.oninput = function () {
      clearTimeout(t);
      t = setTimeout(function () {
        var e2 = store.get("journal", {});
        if (box.value.trim()) e2[today()] = box.value; else delete e2[today()];
        store.set("journal", e2);
        $("#saveHint", v).textContent = "Saved.";
      }, 400);
    };
  }

  renderers.quiet = renderQuiet;

  /* ================================================================
     TAB 4 - DAILY
     ================================================================ */
  var BANK = null;
  var dailyState = {
    mode: "home", idx: 0, picked: null, remaining: 15, timer: null, questions: [], opened: null,
    correct: 0, filter: { tag: null, level: null }, practicePool: null, milestone: null
  };

  function theoScoreToday() {
    return 380 + (hash("theoscore" + today()) % 141);
  }

  function loadBank() {
    if (BANK) return Promise.resolve(BANK);
    return fetch("data/trivia.json")
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (j) { BANK = j; return BANK; })
      .catch(function () { BANK = D.MINI_TRIVIA.slice(); return BANK; });
  }

  function points() { return store.get("points", 0); }
  function addPoints(n) {
    var p = points() + n;
    store.set("points", p);
    applyUnlocks();
    return p;
  }
  function streak() { return store.get("streak", { count: 0, best: 0, last: "" }); }

  function markStreak() {
    var s = streak();
    if (s.last === today()) return s;
    s.count = (s.last === dayOffset(-1)) ? s.count + 1 : 1;
    s.last = today();
    if (s.count > s.best) s.best = s.count;
    store.set("streak", s);
    return s;
  }

  function unlocked() {
    var pts = points();
    return D.REWARDS.filter(function (r) { return pts >= r.points; }).map(function (r) { return r.id; });
  }
  function applyUnlocks() {
    var u = unlocked();
    document.body.classList.toggle("has-bow", u.indexOf("outfit") >= 0);
    $("#bar").classList.toggle("golden", u.indexOf("golden") >= 0);
  }

  function dailyQuestions(bank) {
    var rnd = rngFrom(hash("daily" + today()));
    var pool = bank.slice();
    var out = [];
    while (out.length < 5 && pool.length) {
      out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    }
    return out;
  }

  function todayRecord() {
    var rec = store.get("dailyRun", {});
    return rec.date === today() ? rec : null;
  }

  function dailyChallenge() {
    return D.CHALLENGES[hash("chal" + today()) % D.CHALLENGES.length];
  }

  function renderDaily() {
    var v = $("#view-daily");
    loadBank().then(function (bank) { paintDaily(v, bank); });
  }

  function paintDaily(v, bank) {
    applyUnlocks();
    if (dailyState.milestone) { paintMilestone(v); return; }
    if (dailyState.mode === "practiceSetup") { paintPracticeSetup(v, bank); return; }
    if (dailyState.mode === "quiz" || dailyState.mode === "practice") { paintQuiz(v); return; }
    if (dailyState.opened) { paintReward(v); return; }

    var s = streak();
    var pts = points();
    var rec = todayRecord();
    var chal = dailyChallenge();
    var chalDone = store.get("challengeDone", {})[today()];
    var theoScore = theoScoreToday();
    var beatTheo = rec && rec.score > theoScore;

    var html = '<div class="stack">';
    html += '<div class="scorebar">' +
      '<div class="stat"><b>' + pts + "</b><small>POINTS</small></div>" +
      '<div class="stat"><b><svg class="flame" viewBox="0 0 24 24"><use href="#i-flame"/></svg>' + s.count + "</b><small>DAY STREAK</small></div>" +
      '<div class="stat"><b>' + s.best + "</b><small>BEST</small></div>" +
      "</div>";

    html += '<article class="card">' +
      "<h3>Daily Five</h3>" +
      "<p class=\"meta\">" + (rec ? "Done today. You scored " + rec.score + " points." : "Five questions, fresh every day. Answer fast for the bonus.") + "</p>" +
      '<p class="meta" style="margin-top:8px">Theo\'s score today: ' + theoScore + (beatTheo ? '<span class="pill good" style="margin-left:8px">Beat Theo</span>' : "") + "</p>" +
      '<div class="card-row">' +
      '<button class="btn primary" id="startDaily">' + (rec ? "Play again for fun" : "Start") + "</button>" +
      '<button class="btn ghost" id="startPractice">Practice mode</button>' +
      "</div></article>";

    html += '<article class="card soft"><h3 style="font-size:17px">Today\'s challenge</h3>' +
      '<div class="checkline" style="margin-top:10px">' +
      '<button class="box ' + (chalDone ? "on" : "") + '" id="chalBox" aria-label="Mark challenge done">' + ico("i-check") + "</button>" +
      "<span>" + esc(chal) + "</span></div>" +
      '<p class="meta" style="margin:10px 0 0">' + (chalDone ? "Done. 150 points banked." : "Worth 150 points.") + "</p></article>";

    html += "<div><h2 class=\"section-title\">Rewards</h2><div class=\"stack\" style=\"gap:8px\">" +
      D.REWARDS.map(function (r) {
        var open = pts >= r.points;
        return '<div class="reward ' + (open ? "open" : "locked") + '">' +
          (open ? "" : ico("i-lock")) +
          "<span><b>" + esc(r.name) + "</b><small>" + (open ? "Unlocked" : r.points + " points") + "</small></span>" +
          (open ? '<button class="btn small open-reward" data-id="' + r.id + '">Open</button>' : "") +
          "</div>";
      }).join("") + "</div></div>";

    html += "</div>";
    v.innerHTML = html;

    $("#startDaily", v).onclick = function () {
      dailyState.mode = "quiz";
      dailyState.questions = dailyQuestions(bank);
      dailyState.idx = 0; dailyState.picked = null; dailyState.score = 0; dailyState.correct = 0;
      renderDaily();
    };
    $("#startPractice", v).onclick = function () {
      dailyState.mode = "practiceSetup";
      renderDaily();
    };
    $("#chalBox", v).onclick = function () {
      var m = store.get("challengeDone", {});
      if (m[today()]) return;
      m[today()] = true;
      store.set("challengeDone", m);
      addPoints(150);
      toast("150 points");
      renderDaily();
    };
    $$(".open-reward", v).forEach(function (b) {
      b.onclick = function () {
        dailyState.opened = D.REWARDS.filter(function (r) { return r.id === b.dataset.id; })[0];
        renderDaily();
      };
    });
  }

  function paintReward(v) {
    var r = dailyState.opened;
    v.innerHTML = '<div class="stack">' +
      '<div class="card-row" style="margin-top:0"><button class="btn small ghost" id="backDaily">' + ico("i-back") + "Back</button></div>" +
      '<article class="card baby"><h3>' + esc(r.name) + "</h3>" +
      '<p style="margin:0;white-space:pre-wrap;line-height:1.65">' + esc(r.body) + "</p></article></div>";
    $("#backDaily", v).onclick = function () { dailyState.opened = null; renderDaily(); };
  }

  function filterPool(bank, filter) {
    return bank.filter(function (q) {
      if (filter.tag && q.tag !== filter.tag) return false;
      if (filter.level && q.level !== filter.level) return false;
      return true;
    });
  }

  function paintPracticeSetup(v, bank) {
    var filter = dailyState.filter;
    var pool = filterPool(bank, filter);
    var html = '<div class="stack">' +
      '<div class="card-row" style="margin-top:0"><button class="btn small ghost" id="backDaily">' + ico("i-back") + "Back</button></div>" +
      '<h2 class="section-title">Practice</h2>' +
      '<div class="chips" id="catChips">' +
      D.TRIVIA_CATEGORIES.map(function (c) {
        var pressed = c.key === "all" ? !filter.tag : filter.tag === c.tag;
        return '<button class="chip" data-tag="' + c.key + '" aria-pressed="' + pressed + '">' + esc(c.label) + "</button>";
      }).join("") + "</div>" +
      '<div class="chips" id="levelChips">' +
      D.TRIVIA_LEVELS.map(function (l) {
        return '<button class="chip" data-level="' + l.key + '" aria-pressed="' + (l.key === "all" ? !filter.level : filter.level === l.level) + '">' + esc(l.label) + "</button>";
      }).join("") + "</div>" +
      '<article class="card soft"><p class="meta">' + pool.length + " question" + (pool.length === 1 ? "" : "s") + " match this pick.</p>" +
      '<div class="card-row"><button class="btn primary wide" id="beginPractice"' + (pool.length ? "" : " disabled") + ">Start practice</button></div></article>" +
      "</div>";
    v.innerHTML = html;

    $("#backDaily", v).onclick = function () { dailyState.mode = "home"; renderDaily(); };
    $$("#catChips .chip", v).forEach(function (b) {
      b.onclick = function () {
        var c = D.TRIVIA_CATEGORIES.filter(function (x) { return x.key === b.dataset.tag; })[0];
        dailyState.filter.tag = c.tag;
        renderDaily();
      };
    });
    $$("#levelChips .chip", v).forEach(function (b) {
      b.onclick = function () {
        var l = D.TRIVIA_LEVELS.filter(function (x) { return x.key === b.dataset.level; })[0];
        dailyState.filter.level = l.level;
        renderDaily();
      };
    });
    $("#beginPractice", v).onclick = function () {
      if (!pool.length) return;
      dailyState.practicePool = pool;
      dailyState.mode = "practice";
      dailyState.questions = [pool[Math.floor(Math.random() * pool.length)]];
      dailyState.idx = 0; dailyState.picked = null; dailyState.score = 0;
      renderDaily();
    };
  }

  var STREAK_MILESTONES = [3, 7, 14, 30];
  function paintMilestone(v) {
    var count = dailyState.milestone;
    var lines = D.STREAK_CARDS[count] || [];
    var text = lines.length ? lines[hash("mstone" + today()) % lines.length].replace(/\{name\}/g, firstName()) : "Streak milestone.";
    v.innerHTML = '<div class="stack">' +
      '<article class="card baby" style="text-align:center;padding:32px 22px">' +
      '<p class="meta" style="margin-bottom:10px">' + count + " day streak, from Theo</p>" +
      '<p style="margin:0;font-family:Fraunces,Georgia,serif;font-size:21px;line-height:1.5;color:var(--deep)">' + esc(text) + "</p>" +
      '<div class="card-row" style="justify-content:center"><button class="btn primary" id="closeMilestone">Keep going</button></div>' +
      "</article></div>";
    $("#closeMilestone", v).onclick = function () { dailyState.milestone = null; renderDaily(); };
  }

  function confettiBurst() {
    var wrap = document.createElement("div");
    wrap.className = "confetti-wrap";
    var colors = ["#4A78A8", "#BFE3F5", "#DCEFFB", "#FFFFFF"];
    for (var i = 0; i < 40; i++) {
      var piece = document.createElement("i");
      piece.style.left = Math.random() * 100 + "%";
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = (Math.random() * 0.4) + "s";
      piece.style.animationDuration = (1.1 + Math.random() * 0.5) + "s";
      wrap.appendChild(piece);
    }
    document.body.appendChild(wrap);
    setTimeout(function () { wrap.remove(); }, 1900);
  }

  function stopTimer() { if (dailyState.timer) { clearInterval(dailyState.timer); dailyState.timer = null; } }

  function paintQuiz(v) {
    var q = dailyState.questions[dailyState.idx];
    var practice = dailyState.mode === "practice";
    if (!q) { finishQuiz(v); return; }

    var html = '<div class="stack">' +
      '<div style="display:flex;align-items:center;justify-content:space-between">' +
      '<span class="qcount">' + (practice ? "PRACTICE" : "QUESTION " + (dailyState.idx + 1) + " OF 5") + "</span>" +
      '<button class="btn small ghost" id="quitQuiz">' + ico("i-close") + "Exit</button></div>" +
      '<article class="card"><h3 style="font-size:20px">' + esc(q.q) + "</h3>" +
      '<div class="timer"><i id="timerBar" style="width:100%"></i></div>' +
      '<div class="answers" id="answers">' +
      q.choices.map(function (c, i) { return '<button class="answer" data-i="' + i + '">' + esc(c) + "</button>"; }).join("") +
      "</div>" +
      '<div id="reveal"></div></article></div>';
    v.innerHTML = html;

    $("#quitQuiz", v).onclick = function () {
      stopTimer(); dailyState.mode = "home"; renderDaily();
    };

    dailyState.remaining = 15;
    stopTimer();
    dailyState.timer = setInterval(function () {
      dailyState.remaining -= 0.25;
      var bar = $("#timerBar");
      if (!bar) { stopTimer(); return; }
      bar.style.width = Math.max(0, (dailyState.remaining / 15) * 100) + "%";
      if (dailyState.remaining <= 0) stopTimer();
    }, 250);

    $$("#answers .answer", v).forEach(function (b) {
      b.onclick = function () {
        stopTimer();
        var pick = +b.dataset.i;
        var right = pick === q.answer;
        $$("#answers .answer", v).forEach(function (x) {
          x.disabled = true;
          if (+x.dataset.i === q.answer) x.classList.add("right");
          else if (+x.dataset.i === pick) x.classList.add("wrong");
        });
        var gained = 0;
        if (right) {
          gained = 100 + Math.max(0, Math.round((dailyState.remaining / 15) * 100));
          if (!practice) {
            dailyState.score = (dailyState.score || 0) + gained;
            dailyState.correct = (dailyState.correct || 0) + 1;
            addPoints(gained);
          }
        }
        $("#reveal", v).innerHTML =
          '<p class="fact">' + (right ? "Correct. +" + gained + (practice ? " (practice)" : " points") : "The answer was " + esc(q.choices[q.answer]) + ".") + "</p>" +
          '<p class="fact" style="margin-top:4px">' + esc(q.fact) + "</p>" +
          '<button class="btn primary wide" id="nextQ" style="margin-top:14px">' + (practice ? "Another" : (dailyState.idx === 4 ? "Finish" : "Next")) + "</button>";
        $("#nextQ", v).onclick = function () {
          if (practice) {
            var pool = dailyState.practicePool && dailyState.practicePool.length ? dailyState.practicePool : BANK;
            dailyState.questions = [pool[Math.floor(Math.random() * pool.length)]];
            dailyState.idx = 0;
          } else {
            dailyState.idx++;
          }
          renderDaily();
        };
      };
    });
  }

  function finishQuiz(v) {
    stopTimer();
    var score = dailyState.score || 0;
    var perfect = (dailyState.correct || 0) >= 5;
    var rec = todayRecord();
    var justFinished = !rec;
    if (justFinished) {
      store.set("dailyRun", { date: today(), score: score });
      var prevCount = streak().count;
      var s2 = markStreak();
      if (STREAK_MILESTONES.indexOf(s2.count) >= 0 && s2.count !== prevCount) {
        var shown = store.get("milestoneShown", {});
        if (!shown[today()]) {
          shown[today()] = s2.count;
          store.set("milestoneShown", shown);
          dailyState.milestone = s2.count;
        }
      }
    }
    dailyState.mode = "home";
    var s = streak();
    var theoScore = theoScoreToday();
    var beatTheo = score > theoScore;
    v.innerHTML = '<div class="stack">' +
      '<article class="card baby"><h3>Daily Five done</h3>' +
      "<p>You banked " + score + " points today. Streak is " + s.count + (s.count === 1 ? " day." : " days.") + "</p>" +
      (beatTheo ? '<p class="meta">You scored ' + score + " to Theo's " + theoScore + '. <span class="pill good">Beat Theo</span></p>' : "") +
      '<div class="card-row"><button class="btn primary" id="backHome">Back to Daily</button></div></article></div>';
    $("#backHome", v).onclick = function () { renderDaily(); };
    if (justFinished && perfect) confettiBurst();
  }

  renderers.daily = renderDaily;

  /* ================================================================
     SETTINGS
     ================================================================ */
  function openSheet() {
    renderSheet();
    $("#scrim").hidden = false;
    $("#sheet").hidden = false;
  }
  function closeSheet() {
    $("#scrim").hidden = true;
    $("#sheet").hidden = true;
  }

  function renderSheet() {
    var p = profile();
    var key = store.get("geminiKey", "");
    var body = $("#sheetBody");
    body.innerHTML =
      "<h3>Gemini key</h3>" +
      '<label class="field"><span>Paste your key</span>' +
      '<input id="keyInput" type="password" autocomplete="off" spellcheck="false" placeholder="Paste here" value="' + esc(key) + '"></label>' +
      '<div class="card-row" style="margin-top:0">' +
      '<button class="btn small" id="toggleKey">Show</button>' +
      '<button class="btn small" id="testKey">Test key</button>' +
      '<span id="keyStatus"></span></div>' +
      '<ol class="steps" style="margin-top:14px">' +
      '<li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> and sign in with a Google account.</li>' +
      "<li>Click Create API key and copy the long string it gives you.</li>" +
      "<li>Paste it above. It stays on this phone and is never sent anywhere but Google.</li></ol>" +

      "<h3>About you</h3>" +
      '<label class="field"><span>Name</span><input id="pf-name" value="' + esc(p.name) + '"></label>' +
      '<label class="field"><span>City or zip</span><input id="pf-city" value="' + esc(p.city) + '"></label>' +
      '<label class="field"><span>Styles (comma separated)</span><input id="pf-styles" value="' + esc((p.styles || []).join(", ")) + '"></label>' +
      '<label class="field"><span>Height</span><input id="pf-height" value="' + esc(p.height) + '"></label>' +
      '<label class="field"><span>Agency</span><input id="pf-agency" value="' + esc(p.agency) + '"></label>' +
      '<label class="field"><span>Availability</span><input id="pf-availability" value="' + esc(p.availability) + '"></label>' +
      '<label class="field"><span>Reel link</span><input id="pf-reel" value="' + esc(p.reel) + '" placeholder="https://"></label>' +
      '<label class="field"><span>Credits (trainings, roles, notable jobs)</span><textarea id="pf-credits" placeholder="One per line, or however you want it">' + esc(p.credits) + "</textarea></label>" +
      '<button class="btn primary wide" id="saveProfileBtn">Save</button>' +

      "<h3>Bio and resume</h3>" +
      "<p class=\"lede\" style=\"margin-bottom:14px\">Built from your profile and credits above. Save those first for the best draft.</p>" +
      '<button class="btn wide" id="writeBioBtn">Write my bio</button>' +
      '<div id="bioSlot"></div>' +

      "<h3>Danger zone</h3>" +
      '<button class="btn wide" id="resetAll">Reset everything</button>' +
      '<p class="meta" style="text-align:center;margin:22px 0 4px">Bluebird v' + esc(VERSION) + "</p>";

    var keyInput = $("#keyInput", body);
    keyInput.onchange = function () { store.set("geminiKey", keyInput.value.trim()); };
    $("#toggleKey", body).onclick = function () {
      var showing = keyInput.type === "text";
      keyInput.type = showing ? "password" : "text";
      this.textContent = showing ? "Show" : "Hide";
    };
    $("#testKey", body).onclick = function () {
      store.set("geminiKey", keyInput.value.trim());
      var st = $("#keyStatus", body);
      st.innerHTML = '<span class="pill">testing</span>';
      gemini({ contents: [{ role: "user", parts: [{ text: "Reply with the single word: ready" }] }] })
        .then(function () { st.innerHTML = '<span class="pill good">' + ico("i-check") + "working</span>"; })
        .catch(function () { st.innerHTML = '<span class="pill warm">no luck, check the key</span>'; });
    };
    $("#saveProfileBtn", body).onclick = function () {
      var np = profile();
      np.name = $("#pf-name", body).value.trim() || "Gabby";
      np.city = $("#pf-city", body).value.trim();
      np.styles = $("#pf-styles", body).value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      np.height = $("#pf-height", body).value.trim();
      np.agency = $("#pf-agency", body).value.trim();
      np.availability = $("#pf-availability", body).value.trim();
      np.reel = $("#pf-reel", body).value.trim();
      np.credits = $("#pf-credits", body).value.trim();
      saveProfile(np);
      store.set("geminiKey", keyInput.value.trim());
      toast("Saved");
      closeSheet();
      renderers[current]();
    };
    $("#writeBioBtn", body).onclick = function () { writeBio(body); };
    renderBioSlot(body);
    $("#resetAll", body).onclick = function () {
      if (!window.confirm("This clears your key, chats, moods, journal and points on this device. Continue?")) return;
      store.wipe();
      location.href = location.pathname;
    };
  }

  function parseBioJson(text) {
    var t = String(text).trim().replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim();
    var a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0 || b < a) throw new Error("no object");
    var obj = JSON.parse(t.slice(a, b + 1));
    if (!obj.bio) throw new Error("no bio");
    var bullets = (Array.isArray(obj.bullets) ? obj.bullets : []).filter(Boolean).slice(0, 6);
    if (!bullets.length) throw new Error("no bullets");
    return { bio: obj.bio, bullets: bullets };
  }

  function fallbackBio(p) {
    var styles = (p.styles && p.styles.length) ? p.styles.join(", ") : "contemporary, jazz and commercial";
    var bio = (p.name || "Gabby") + " is a dancer based in " + (p.city || "Miami, FL") + ", trained in " + styles + "." +
      (p.height ? " Standing " + p.height + "," : "") +
      " she brings versatility and reliability to every call, room and rehearsal, always working toward the next opportunity to grow and perform.";
    var bullets = [
      "Trained in " + styles + ".",
      p.height ? "Height: " + p.height + "." : "Consistent, coachable, and quick to pick up choreography.",
      p.agency ? "Represented by " + p.agency + "." : "Open to representation and submissions.",
      p.availability ? "Availability: " + p.availability + "." : "Flexible availability for calls and contracts.",
      p.union ? "Union status: " + p.union + "." : "Comfortable in union and non-union rooms.",
      p.credits ? p.credits.split("\n")[0] : "Committed to steady training and audition readiness."
    ];
    return { bio: bio, bullets: bullets, offline: true };
  }

  function renderBioSlot(body) {
    var bio = store.get("bio", null);
    var slot = $("#bioSlot", body);
    if (!slot) return;
    if (!bio) { slot.innerHTML = ""; return; }
    slot.innerHTML = '<div class="card soft" style="margin-top:12px">' +
      (bio.offline ? '<p class="meta" style="margin-bottom:8px">Starter draft ' + offlinePill() + "</p>" : "") +
      "<p style=\"white-space:pre-wrap;margin-bottom:10px\">" + esc(bio.bio) + "</p>" +
      '<ul class="me-bullets">' + bio.bullets.map(function (b) { return "<li>" + esc(b) + "</li>"; }).join("") + "</ul>" +
      '<button class="btn small copy-bio-settings">' + ico("i-copy") + "Copy</button></div>";
    $(".copy-bio-settings", slot).onclick = function () { copy(bio.bio + "\n\n" + bio.bullets.join("\n")); };
  }

  function writeBio(body) {
    var btn = $("#writeBioBtn", body);
    btn.disabled = true;
    btn.textContent = "Writing...";
    var p = profile();

    function land(b) {
      store.set("bio", b);
      btn.disabled = false;
      btn.textContent = "Write my bio";
      renderBioSlot(body);
    }

    if (!hasKey()) { setTimeout(function () { land(fallbackBio(p)); }, 300); return; }

    gemini({
      system: D.SYSTEM.bio,
      contents: [{ role: "user", parts: [{ text: "Dancer: " + profileBlurb() + (p.credits ? " Credits: " + p.credits : "") + "\nWrite the bio and bullets as JSON only." }] }],
      json: true
    }).then(function (r) {
      var parsed = parseBioJson(r.text);
      land({ bio: parsed.bio, bullets: parsed.bullets, offline: false });
    }).catch(function () { land(fallbackBio(p)); });
  }

  /* ================================================================
     WELCOME
     ================================================================ */
  function bigBird() {
    return '<svg class="bigbird" viewBox="0 0 44 40">' +
      '<ellipse class="bird-body" cx="21" cy="24" rx="13.5" ry="12.5"/>' +
      '<circle class="bird-head" cx="30" cy="13.5" r="8.5"/>' +
      '<path class="bird-wing" d="M15 22c5.5-1.5 9.5 1 11 5.5-4.5 2.5-9.5 1-11-5.5Z"/>' +
      '<path class="bird-beak" d="M38 13.2 43.5 15l-5.2 2.4Z"/>' +
      '<path class="bird-tail" d="M8.5 20.5 1 16.5l3.5 7.5Z"/>' +
      '<ellipse class="bird-eye" cx="32.4" cy="11.8" rx="1.5" ry="1.7"/></svg>';
  }

  function showWelcome() {
    var w = $("#welcome");
    var p0 = profile();
    var isIOS = window.BB_PWA && window.BB_PWA.isIOS();
    var cards = [
      '<div class="wcard">' + bigBird() + "<h2>Hi there.</h2>" +
        "<p>This is Bluebird. It is yours, it lives on your phone, and nobody else can see any of it.</p>" +
        '<label class="field"><span>What should Theo call you</span><input id="welcomeName" placeholder="Gabby" value="' + esc(p0.name || "") + '"></label>' +
        '<label class="field"><span>Where are you based</span><input id="welcomeCity" placeholder="Miami, FL" value="' + esc(p0.city || "") + '"></label></div>',
      '<div class="wcard"><h2>Four rooms.</h2>' +
        "<p><strong>Gigs</strong> hunts work and writes your pitch.<br><strong>Theo</strong> is a warm voice who keeps up with you.<br><strong>Quiet Room</strong> is for the heavier days.<br><strong>Daily</strong> is trivia, streaks and small wins.</p></div>",
      '<div class="wcard"><h2>One optional step.</h2>' +
        "<p>A free Google Gemini key makes the smart parts smart. Skip it and everything still works, just scripted.</p>" +
        '<label class="field"><span>Gemini key</span><input id="welcomeKey" type="password" placeholder="Paste here, or skip"></label>' +
        '<p class="meta"><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Get a free key</a></p>' +
        '<p class="meta" style="margin-top:16px;font-weight:800;color:var(--deep)">Put Bluebird on your home screen</p>' +
        (isIOS
          ? '<p class="meta">Tap the share icon, then "Add to Home Screen".</p>'
          : '<p class="meta">Open the browser menu, then "Install app" (or "Add to Home Screen").</p>') +
        "</div>"
    ];
    $("#welcomeCards").innerHTML = cards.join("");
    var dots = $("#welcomeDots");
    dots.innerHTML = cards.map(function (_, i) { return "<i" + (i === 0 ? ' class="on"' : "") + "></i>"; }).join("");
    w.hidden = false;

    var strip = $("#welcomeCards");
    var next = $("#welcomeNext");
    function slides() { return $$(".wcard", strip); }
    function at() {
      // nearest card by real offset; dividing by width drifts when the browser adds scroll slack
      var x = strip.scrollLeft, best = 0, bd = Infinity;
      slides().forEach(function (c, i) { var d = Math.abs(c.offsetLeft - x); if (d < bd) { bd = d; best = i; } });
      return best;
    }
    function sync() {
      var i = at();
      $$("i", dots).forEach(function (d, j) { d.className = j === i ? "on" : ""; });
      next.textContent = i === cards.length - 1 ? "Let's go" : "Next";
    }
    strip.addEventListener("scroll", sync, { passive: true });
    next.onclick = function () {
      var i = at();
      if (i < cards.length - 1) {
        var target = slides()[i + 1];
        strip.scrollTo({ left: target ? target.offsetLeft : (i + 1) * strip.clientWidth, behavior: "smooth" });
        setTimeout(sync, 400);
      } else {
        var k = $("#welcomeKey");
        if (k && k.value.trim()) store.set("geminiKey", k.value.trim());
        var np = profile();
        var wn = $("#welcomeName"), wc = $("#welcomeCity");
        np.name = (wn && wn.value.trim()) || np.name || "Gabby";
        np.city = (wc && wc.value.trim()) || np.city || "Miami, FL";
        saveProfile(np);
        store.set("onboarded", true);
        w.hidden = true;
        renderers[current]();
      }
    };
    sync();
  }

  /* ================================================================
     BOOT
     ================================================================ */
  function boot() {
    if (window.BB_PWA) window.BB_PWA.registerSW();
    var params = new URLSearchParams(location.search);
    var tab = params.get("tab");
    var skip = params.get("skipWelcome") === "1";

    $$(".tab").forEach(function (b) {
      b.onclick = function () { go(b.dataset.tab); };
    });
    $("#openSettings").onclick = openSheet;
    $("#closeSettings").onclick = closeSheet;
    $("#scrim").onclick = closeSheet;
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !$("#sheet").hidden) closeSheet();
    });
    window.addEventListener("popstate", function () {
      var t = new URLSearchParams(location.search).get("tab");
      go(TABS.indexOf(t) >= 0 ? t : "gigs", true);
    });

    applyUnlocks();
    go(TABS.indexOf(tab) >= 0 ? tab : "gigs", true);

    if (skip) store.set("onboarded", true);
    if (!store.get("onboarded", false) && !skip) showWelcome();
    if (params.get("settings") === "1") openSheet();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
