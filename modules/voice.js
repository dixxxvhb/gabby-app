/* Bluebird voice helpers: speech synthesis (Theo reads aloud) + speech recognition (mic input). */
window.BB_VOICE = (function () {
  "use strict";

  var PREFER = ["Natural", "Enhanced", "Samantha", "Aaron", "Daniel"];
  var pickedVoice = null;
  var voicesReady = false;

  function loadVoices() {
    if (!("speechSynthesis" in window)) return;
    var vs = window.speechSynthesis.getVoices();
    if (!vs || !vs.length) return;
    voicesReady = true;
    var en = vs.filter(function (v) { return /^en/i.test(v.lang); });
    var pool = en.length ? en : vs;
    var best = null;
    PREFER.some(function (name) {
      best = pool.filter(function (v) { return v.name.indexOf(name) >= 0; })[0];
      return !!best;
    });
    pickedVoice = best || pool[0] || null;
  }

  if ("speechSynthesis" in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  function canSpeak() { return "speechSynthesis" in window; }

  function speak(text) {
    if (!canSpeak() || !text) return;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(String(text));
      if (pickedVoice) u.voice = pickedVoice;
      u.rate = 0.95;
      u.pitch = 1.0;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  function stopSpeaking() {
    if (canSpeak()) { try { window.speechSynthesis.cancel(); } catch (e) {} }
  }

  /* ---- recognition ---- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function canListen() { return !!SR; }

  // opts: { onInterim(text), onFinal(text), onStart(), onEnd() }
  function makeListener(opts) {
    opts = opts || {};
    if (!SR) return null;
    var rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    var silenceTimer = null;
    var finalText = "";

    rec.onstart = function () { finalText = ""; if (opts.onStart) opts.onStart(); };
    rec.onresult = function (e) {
      var interim = "";
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (opts.onInterim) opts.onInterim((finalText + " " + interim).trim());
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(function () {
        try { rec.stop(); } catch (e2) {}
      }, 1500);
    };
    rec.onerror = function () { if (opts.onEnd) opts.onEnd(finalText.trim()); };
    rec.onend = function () { clearTimeout(silenceTimer); if (opts.onEnd) opts.onEnd(finalText.trim()); };

    return {
      start: function () { try { rec.start(); } catch (e) {} },
      stop: function () { try { rec.stop(); } catch (e) {} }
    };
  }

  return { canSpeak: canSpeak, speak: speak, stopSpeaking: stopSpeaking, canListen: canListen, makeListener: makeListener };
})();
