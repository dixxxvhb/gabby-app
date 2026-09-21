# Bluebird status (2026-09-20, end of build night)

Live: https://dixxxvhb.github.io/gabby-app/  (GitHub Pages, auto-deploys on push to main)
Version in app: 3.1

## Working, verified live with a real key
- Four rooms: Gigs, Theo, Quiet Room, Daily. PWA install, Theo reads aloud, mic input.
- Gemini: AQ. keys via x-goog-api-key header; model chain (3.6 -> 3.8 -> 3.5 -> ...) rolls on free-tier 429/404/503.
- Gigs: results with "Look it up" (live Google search per card), grounded links only when Google supplies them.
- Share my day: recap text to iOS share sheet, nothing leaves the phone otherwise.

## Known limits
- One free key shared = daily caps; "offline" pill means quota or no key on that device.
- Search grounding is 429 on free keys, so gig results are model knowledge, not live listings.

## Next (only if Gabby comes back): accurate live job links
Cloudflare Worker "bluebird-scout" (free):
1. /search -> Tavily free tier (1000/mo) restricted to audition boards + general; Gemini only formats; links are search results, never invented.
2. /boards -> scrape + 6h cache: royalcaribbeanentertainment.com/productions/upcoming-auditions, NCL Creative Studios, Carnival, disneyauditions.com, jobs.universalparks.com/auditions, danceinforma.com/auditions, Backstage dance casting, Playbill. "Posted this week" section in Gigs.
3. Drop any link that does not return 200 live.
Needs: Cloudflare account + Tavily key (worker secret, never in the static app).

## Other ideas parked
- Theo texts her (needs her number + a free scheduler); the one thing that would drive a second open.
- Second Gemini key from her own Google account for her own quota.
