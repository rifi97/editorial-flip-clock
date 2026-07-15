import test from "node:test";
import assert from "node:assert/strict";
import {
  colorDistance,
  colorsAreTooSimilar,
  getMaxExportDuration,
  normalizeHexColor,
  pickRecorderFormat,
} from "./videoExport.js";

test("normalizes valid colors and falls back for invalid values", () => {
  assert.equal(normalizeHexColor("#F1E7D0", "#ffffff"), "#f1e7d0");
  assert.equal(normalizeHexColor("green", "#ffffff"), "#ffffff");
});

test("detects colors that are too similar for clean keying", () => {
  assert.equal(colorsAreTooSimilar("#00ff00", "#16e81a"), true);
  assert.equal(colorsAreTooSimilar("#f1e7d0", "#00ff00"), false);
  assert.ok(colorDistance("#000000", "#ffffff") > 400);
});

test("prefers an MP4 recorder and falls back to WebM", () => {
  const mp4 = pickRecorderFormat((mimeType) => mimeType === "video/mp4");
  const webm = pickRecorderFormat((mimeType) => mimeType === "video/webm;codecs=vp9");
  assert.deepEqual(mp4, { mimeType: "video/mp4", extension: "mp4", label: "MP4" });
  assert.deepEqual(webm, {
    mimeType: "video/webm;codecs=vp9",
    extension: "webm",
    label: "WebM",
  });
  assert.equal(pickRecorderFormat(() => false), null);
});

test("avoids fixed low-level AVC profiles for 4K and applies safe duration limits", () => {
  const onlyBaseline = (mimeType) => mimeType === "video/mp4;codecs=avc1.42E01E";
  assert.equal(pickRecorderFormat(onlyBaseline, "4k"), null);
  assert.equal(pickRecorderFormat(onlyBaseline, "1080p")?.extension, "mp4");
  assert.equal(getMaxExportDuration("1080p"), 120);
  assert.equal(getMaxExportDuration("4k"), 60);
});
