export const SECONDS_PER_DAY = 24 * 60 * 60;

export function isClockTime(value) {
  if (!/^\d{2}:\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes, seconds] = value.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds <= 59;
}

export function parseClockTime(value) {
  const [hours, minutes, seconds] = value.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

export function formatClockTime(totalSeconds) {
  const normalized = ((Math.round(totalSeconds) % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  const seconds = normalized % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function clampDuration(value) {
  return Math.min(3600, Math.max(0.1, value));
}

function ease(progress, easing) {
  if (easing === "smooth") {
    return progress * progress * (3 - 2 * progress);
  }
  return progress;
}

export function interpolateClockTime(start, end, progress, direction, easing) {
  const safeProgress = Math.min(1, Math.max(0, progress));
  const easedProgress = ease(safeProgress, easing);
  if (safeProgress === 1) return end;
  let distance;

  if (direction === "down") {
    distance = start >= end ? start - end : start + SECONDS_PER_DAY - end;
    return Math.ceil(start - distance * easedProgress);
  }

  distance = end >= start ? end - start : end + SECONDS_PER_DAY - start;
  return Math.floor(start + distance * easedProgress);
}
