import test from "node:test";
import assert from "node:assert/strict";
import {
  clampDuration,
  formatClockTime,
  interpolateClockTime,
  isClockTime,
  parseClockTime,
} from "./time.js";

test("validates and parses HH:MM:SS values", () => {
  assert.equal(isClockTime("23:59:59"), true);
  assert.equal(isClockTime("24:00:00"), false);
  assert.equal(isClockTime("1:02:03"), false);
  assert.equal(parseClockTime("01:02:03"), 3723);
});

test("formats values and wraps at midnight", () => {
  assert.equal(formatClockTime(3723), "01:02:03");
  assert.equal(formatClockTime(86401), "00:00:01");
  assert.equal(formatClockTime(-1), "23:59:59");
});

test("interpolates increasing time and reaches the endpoint", () => {
  const start = parseClockTime("08:00:00");
  const end = parseClockTime("09:00:00");
  assert.equal(formatClockTime(interpolateClockTime(start, end, 0.5, "up", "linear")), "08:30:00");
  assert.equal(interpolateClockTime(start, end, 1, "up", "smooth"), end);
});

test("interpolates decreasing time and wraps through midnight", () => {
  const start = parseClockTime("00:00:10");
  const end = parseClockTime("23:59:50");
  assert.equal(formatClockTime(interpolateClockTime(start, end, 0.5, "down", "linear")), "00:00:00");
  assert.equal(formatClockTime(interpolateClockTime(start, end, 1, "down", "smooth")), "23:59:50");
});

test("does not display a short-range target before progress completes", () => {
  const zero = parseClockTime("00:00:00");
  const one = parseClockTime("00:00:01");
  assert.equal(interpolateClockTime(zero, one, 0.999, "up", "linear"), zero);
  assert.equal(interpolateClockTime(zero, one, 1, "up", "linear"), one);
  assert.equal(interpolateClockTime(one, zero, 0.999, "down", "linear"), one);
  assert.equal(interpolateClockTime(one, zero, 1, "down", "linear"), zero);
});

test("clamps transition duration to supported limits", () => {
  assert.equal(clampDuration(0), 0.1);
  assert.equal(clampDuration(7.5), 7.5);
  assert.equal(clampDuration(9000), 3600);
});
