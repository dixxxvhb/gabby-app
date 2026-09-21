/* Bluebird trivia bank verification (round 3).
   Asserts: >=400 total questions, unique ids, unique question text,
   4 distinct choices per question, answer index in range, level 1-3 when present.
   Run: node scripts/verify-trivia.js */
"use strict";
var fs = require("fs");
var path = require("path");
var FILE = path.join(__dirname, "..", "data", "trivia.json");

var data = JSON.parse(fs.readFileSync(FILE, "utf8"));
var errors = [];

if (!Array.isArray(data)) errors.push("trivia.json is not an array");
if (data.length < 400) errors.push("total questions " + data.length + " is under 400");

var ids = {};
var texts = {};
var dupIds = [];
var dupTexts = [];

data.forEach(function (q, i) {
  var where = "index " + i + " (id " + q.id + ")";
  if (ids[q.id]) dupIds.push(q.id);
  ids[q.id] = true;

  var key = String(q.q || "").trim().toLowerCase();
  if (texts[key]) dupTexts.push(q.q);
  texts[key] = true;

  if (!Array.isArray(q.choices) || q.choices.length !== 4) {
    errors.push(where + ": does not have exactly 4 choices");
  } else {
    var distinct = {};
    q.choices.forEach(function (c) { distinct[String(c).trim().toLowerCase()] = true; });
    if (Object.keys(distinct).length !== 4) errors.push(where + ": choices are not 4 distinct values");
  }

  if (typeof q.answer !== "number" || q.answer < 0 || q.answer > 3) {
    errors.push(where + ": answer index " + q.answer + " out of range 0-3");
  }

  if (q.level !== undefined && [1, 2, 3].indexOf(q.level) < 0) {
    errors.push(where + ": level " + q.level + " is not 1, 2, or 3");
  }

  if (!q.category || !q.q || !q.fact) errors.push(where + ": missing category, q, or fact");
});

if (dupIds.length) errors.push("duplicate ids: " + Array.from(new Set(dupIds)).join(", "));
if (dupTexts.length) errors.push("duplicate question text: " + dupTexts.join(" | "));

var categoryCounts = {};
data.forEach(function (q) { categoryCounts[q.category] = (categoryCounts[q.category] || 0) + 1; });

var result = {
  total: data.length,
  categoryCounts: categoryCounts,
  uniqueIds: Object.keys(ids).length === data.length,
  uniqueQuestionText: dupTexts.length === 0,
  pass: errors.length === 0
};

console.log(JSON.stringify(result, null, 2));
if (errors.length) {
  console.error("\nFAILURES:");
  errors.forEach(function (e) { console.error(" - " + e); });
  process.exit(1);
}
