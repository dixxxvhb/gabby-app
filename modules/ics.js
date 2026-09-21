/* Bluebird - builds a downloadable .ics file for a saved audition. No dependencies. */
(function () {
  "use strict";

  function pad(n) { return String(n).padStart(2, "0"); }

  function icsDate(dateStr, timeStr) {
    var d = String(dateStr || "").replace(/-/g, "");
    if (timeStr) return d + "T" + timeStr.replace(":", "") + "00";
    return d;
  }

  function escText(s) {
    return String(s || "")
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function stamp() {
    var d = new Date();
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" +
      pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z";
  }

  function build(a) {
    var hasTime = !!a.time;
    var dtStart = icsDate(a.date, a.time);
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Bluebird//Auditions//EN",
      "BEGIN:VEVENT",
      "UID:" + (a.id || Date.now()) + "@bluebird.app",
      "DTSTAMP:" + stamp(),
      "SUMMARY:" + escText(a.title || "Audition"),
      hasTime ? "DTSTART:" + dtStart : "DTSTART;VALUE=DATE:" + dtStart,
      a.place ? "LOCATION:" + escText(a.place) : null,
      (a.notes || a.org) ? "DESCRIPTION:" + escText([a.org, a.notes].filter(Boolean).join(" - ")) : null,
      "END:VEVENT",
      "END:VCALENDAR"
    ].filter(function (l) { return l !== null; });
    return lines.join("\r\n");
  }

  function download(a) {
    var ics = build(a);
    var blob = new Blob([ics], { type: "text/calendar" });
    var url = URL.createObjectURL(blob);
    var name = (a.title || "audition").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "audition";
    var link = document.createElement("a");
    link.href = url;
    link.download = name + ".ics";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  window.BB_ICS = { build: build, download: download };
})();
