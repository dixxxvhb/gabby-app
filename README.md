# Bluebird

Bluebird is a small, private app for Gabby: a dancer's gig hunter, a warm companion called Theo, a Quiet Room for the heavier days, and a Daily tab with trivia, streaks and rewards. It is plain HTML, CSS and JavaScript with no build step, so it runs by opening `index.html` or from GitHub Pages, and everything it remembers stays in your own browser under the `bluebird.` keys in localStorage.

The smart parts run on Google Gemini, called straight from your browser. To turn them on, open Settings (the gear in the header), go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey), sign in with a Google account, click Create API key, and paste the key into the Gemini key field. Tap Test key to confirm it works. The key is stored only on your device and is never committed to this repository or sent anywhere except Google. Without a key the app still works end to end: every AI feature falls back to a written-in-advance version and shows a small grey "offline" pill.
