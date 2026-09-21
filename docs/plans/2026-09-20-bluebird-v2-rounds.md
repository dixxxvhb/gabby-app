# Bluebird v2 — three upgrade rounds

Base: v1 is live at https://dixxxvhb.github.io/gabby-app/ (see 2026-09-20-bluebird-v1.md for the
full spec, palette, fonts, hard rules; all of it still applies). Gemini client facts learned live:
model is `gemini-3.6-flash`, key goes in the `x-goog-api-key` header, search grounding is quota-blocked
on free keys (Gigs already retries ungrounded with `json: true`), 500/503 retry with backoff exists in
`gemini()`. Do not change any of that.

Shared rules for every round
- Vanilla only, no build step. No emojis anywhere. Same palette and fonts. Mobile first at 390.
- New code goes in new files where possible (`modules/*.js`, loaded by plain script tags before app.js
  or as functions app.js calls) so rounds stay diffable. app.js may be edited where needed.
- Every AI feature keeps a scripted fallback and the grey offline pill.
- Verify with playwright screenshots into docs/shots/v2/<round>-*.png at 390 wide, write
  docs/checks-<round>.json, `node -e "new Function(require('fs').readFileSync('app.js','utf8'))"`
  as a syntax gate on every JS file, commit locally "Bluebird v2 round N", do not push.
- Bump the `?v=` on the script and stylesheet tags in index.html each round (cache busting).

## Round 1 — she can talk to it, and it lives on her phone
1. **PWA.** `manifest.webmanifest` (name Bluebird, short_name Bluebird, theme #DCEFFB, background
   #DCEFFB, display standalone, start_url ./), icons 192 + 512 PNG rendered from the SVG mascot (generate
   with playwright screenshot of an icon.html page, or sharp is NOT available; use playwright). Apple
   meta tags: apple-mobile-web-app-capable, status-bar default, apple-touch-icon 180. `sw.js`: cache-first
   for the app shell (index, css, js, data, fonts CSS), network-first for everything else, versioned cache
   name, skipWaiting + clients.claim. Register in app.js.
2. **Theo speaks.** Web Speech Synthesis: a small speaker toggle in the Theo header ("Theo reads aloud").
   When on, each new Theo message is spoken; pick the best available en-US voice (prefer names containing
   "Natural", "Enhanced", "Samantha", "Aaron", "Daniel"; otherwise the first en voice), rate 0.95,
   pitch 1.0. Persist toggle in `bluebird.theoVoice`. Same toggle offered in Quiet Room (default off).
3. **She speaks.** Mic button beside the send input in Theo and Quiet Room using
   webkitSpeechRecognition / SpeechRecognition when available; hides itself otherwise. Tap to start,
   shows a soft pulsing ring while listening, interim text fills the input, final result sends on tap
   again or after 1.5s silence. iOS Safari lacks it: the button hides, no error.
4. **Welcome upgrade.** Card 1 asks her name (default Gabby) and city (default Miami, FL) inline so the
   whole app is personalized before she reaches a tab. Card 3 gets an "Add to Home Screen" hint with
   iOS (share, Add to Home Screen) and Android (menu, Install app) lines.
5. **Cache busting** on index.html tags, and a tiny "Bluebird vX" in Settings footer reading from a
   `VERSION` constant.

## Round 2 — Gigs becomes a real manager
1. **Prep me.** Every gig card gains "Prep me": Gemini writes an audition prep kit for that exact call:
   what to wear, what to bring, likely combo style, 3 things to rehearse, 2 smart questions to ask,
   one line of encouragement. Rendered as a checklist with tappable checkboxes, saved under
   `bluebird.prep[<gigId>]`. Scripted fallback = a generic kit.
2. **Audition calendar.** "Add to my calendar" on a card opens a small inline form (date, time, place,
   notes) and saves to `bluebird.auditions`. New sub-tab in Gigs: Results / Saved / **Upcoming**, sorted
   by date, with a countdown ("in 3 days"), and a "Download .ics" button per item so it lands in her
   phone calendar (build the .ics as a Blob, filename from the title).
3. **Bio and resume builder.** In Settings → About you, a "Write my bio" button: Gemini writes a 60-word
   third-person dancer bio and 6 resume bullet points from her profile plus a free-text "credits" field
   (new profile field, textarea). Shown in a card with Copy. Saved to `bluebird.bio`. Also shows in a
   new "Me" card at the top of Gigs (collapsed by default) so she can copy it into applications.
4. **Smarter search.** Location field accepts a zip; if it is 5 digits, tell the model "zip NNNNN (USA)".
   Add a radius chip row: "Nearby" / "Statewide" / "Anywhere I'd travel" that changes the prompt.
   Results keep a "Searched <loc> · <time>" line; last results persist across reloads in
   `bluebird.gigsLast` so the tab is never empty.
5. **Pitch improvements.** Pitch drafter reads `bluebird.bio` when present and offers two tones via chips:
   "Warm" / "Crisp". Copy button confirms "Copied" for 1.5s.

## Round 3 — Daily goes deeper, Theo and Quiet Room remember
1. **Trivia bank to 400.** Append 200 more questions to data/trivia.json (keep ids unique, same field
   shape, facts true, no duplicates of existing questions; run a script that asserts uniqueness of `q`
   and 4 distinct choices). Keep the 60/40 dance/general split.
2. **Category picker + difficulty.** Practice mode gets chips: All / Ballet / Musicals / Pop / Miami /
   Anatomy (map to `category` and a new optional `tag` field; tag the new questions, and tag existing
   ones where obvious via script). Each question gets `level` 1-3 if missing (heuristic: assign by
   position thirds is NOT acceptable; use a keyword heuristic and hand-set for the new 200).
3. **Blue confetti** on a perfect Daily Five (CSS-only or canvas, palette blues and white, 1.5s, no
   sound). Streak milestones at 3/7/14/30 days show a full-screen soft card from Theo (text from a bank).
4. **Rival mode.** A "Theo's score today" line under the Daily Five: a deterministic per-day number
   between 380 and 520 so she has something to beat; beating it adds a "Beat Theo" pill to today.
5. **Theo remembers.** In Theo, a small "What Theo knows" drawer listing `bluebird.theoMemory` lines with
   a delete-x each, and a "Tell Theo something to remember" input. Sunday: the daily note becomes a
   longer "Sunday letter" (Gemini, from memory + last week's moods if any; scripted fallback).
6. **Quiet Room: Wins jar + weekly reflection.** A "Drop a win" input (one line) saved to
   `bluebird.wins`, shown as small rounded chips in a jar-shaped card; and a "This week" button that asks
   Gemini for a 5-line reflection from the last 7 days of moods, journal entries, and wins (never sent
   anywhere but Gemini; scripted fallback summarizes counts). Crisis-word guard stays untouched.

## Report format (each round, final message only)
1. Shot paths. 2. checks JSON. 3. Believed-not-verified lines.
