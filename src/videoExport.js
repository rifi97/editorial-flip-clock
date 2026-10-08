import { formatClockTime, interpolateClockTime, parseClockTime } from "./time.js";

export const VIDEO_RESOLUTIONS = {
  "1080p": { width: 1920, height: 1080, bitrate: 24_000_000 },
  "4k": { width: 3840, height: 2160, bitrate: 52_000_000 },
};

export const MAX_EXPORT_DURATIONS = {
  "1080p": 120,
  "4k": 60,
};

const H264_RECORDER_FORMATS = [
  { mimeType: "video/mp4;codecs=avc1", extension: "mp4", label: "MP4 · H.264" },
];

const GENERIC_MP4_RECORDER_FORMAT = {
  mimeType: "video/mp4",
  extension: "mp4",
  label: "MP4 · H.264",
};

const WEBM_RECORDER_FORMATS = [
  { mimeType: "video/webm;codecs=vp9", extension: "webm", label: "WebM" },
  { mimeType: "video/webm;codecs=vp8", extension: "webm", label: "WebM" },
  { mimeType: "video/webm", extension: "webm", label: "WebM" },
];

const HD_ONLY_RECORDER_FORMATS = [
  { mimeType: "video/mp4;codecs=avc1.42E01E", extension: "mp4", label: "MP4 · H.264" },
];

const MP4_VIDEO_CODEC_SIGNATURES = ["avc1", "avc3", "hvc1", "hev1", "vp09", "av01"];
const FINAL_CUT_SAFE_MP4_CODECS = new Set(["avc1", "avc3"]);

export function normalizeHexColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value.toLowerCase() : fallback;
}

function hexToRgb(value) {
  const normalized = normalizeHexColor(value, "#000000").slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
}

export function colorDistance(first, second) {
  const [r1, g1, b1] = hexToRgb(first);
  const [r2, g2, b2] = hexToRgb(second);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

export function colorsAreTooSimilar(first, second) {
  return colorDistance(first, second) < 150;
}

export function pickRecorderFormat(isTypeSupported, resolution = "1080p") {
  if (typeof isTypeSupported !== "function") return null;
  const candidates = resolution === "4k"
    ? [...H264_RECORDER_FORMATS, GENERIC_MP4_RECORDER_FORMAT, ...WEBM_RECORDER_FORMATS]
    : [
        ...H264_RECORDER_FORMATS,
        ...HD_ONLY_RECORDER_FORMATS,
        GENERIC_MP4_RECORDER_FORMAT,
        ...WEBM_RECORDER_FORMATS,
      ];
  return candidates.find(({ mimeType }) => isTypeSupported(mimeType)) || null;
}

export function getAvailableRecorderFormat(resolution = "1080p") {
  if (typeof MediaRecorder === "undefined") return null;
  return pickRecorderFormat(MediaRecorder.isTypeSupported.bind(MediaRecorder), resolution);
}

export function getMaxExportDuration(resolution) {
  return MAX_EXPORT_DURATIONS[resolution] || MAX_EXPORT_DURATIONS["1080p"];
}

export async function detectMp4VideoCodec(blob) {
  if (!blob || typeof blob.slice !== "function") return null;
  const bytes = new Uint8Array(
    await blob.slice(0, Math.min(blob.size, 1_048_576)).arrayBuffer(),
  );

  for (let index = 0; index <= bytes.length - 4; index += 1) {
    const signature = String.fromCharCode(
      bytes[index],
      bytes[index + 1],
      bytes[index + 2],
      bytes[index + 3],
    );
    if (MP4_VIDEO_CODEC_SIGNATURES.includes(signature)) return signature;
  }
  return null;
}

export async function assertFinalCutCompatibleRecording(blob, format) {
  if (format.extension !== "mp4") return;
  const codec = await detectMp4VideoCodec(blob);
  if (!FINAL_CUT_SAFE_MP4_CODECS.has(codec)) {
    throw new Error(
      "브라우저가 Final Cut Pro와 호환되지 않는 MP4 코덱을 만들었습니다. Chrome 또는 Safari 최신 버전에서 다시 시도해 주세요.",
    );
  }
}

function drawClockFrame(context, settings, progress) {
  const { canvas } = context;
  const { backgroundColor, clockColor, direction, easing, end, start } = settings;
  const value = formatClockTime(
    interpolateClockTime(
      parseClockTime(start),
      parseClockTime(end),
      progress,
      direction,
      easing,
    ),
  );

  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const fontSize = canvas.height * 0.34;
  const slotWidths = value.split("").map((character) =>
    fontSize * (character === ":" ? 0.2 : 0.57));
  const totalWidth = slotWidths.reduce((sum, width) => sum + width, 0);
  const horizontalScale = 1.14;

  context.save();
  context.scale(horizontalScale, 1);
  context.fillStyle = clockColor;
  context.font = `800 ${fontSize}px Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  let cursor = canvas.width / (2 * horizontalScale) - totalWidth / 2;
  value.split("").forEach((character, index) => {
    const slotWidth = slotWidths[index];
    context.fillText(character, cursor + slotWidth / 2, canvas.height / 2);
    cursor += slotWidth;
  });
  context.restore();

  context.fillStyle = backgroundColor;
  context.fillRect(canvas.width * 0.05, canvas.height / 2, canvas.width * 0.9, 2);
}

export async function recordClockVideo(settings, { onProgress, signal } = {}) {
  const format = getAvailableRecorderFormat(settings.resolution);
  const resolution = VIDEO_RESOLUTIONS[settings.resolution] || VIDEO_RESOLUTIONS["1080p"];
  const maxDuration = getMaxExportDuration(settings.resolution);

  if (!format) throw new Error("이 브라우저는 영상 녹화를 지원하지 않습니다.");
  if (Number(settings.duration) > maxDuration) {
    throw new Error(`이 해상도는 최대 ${maxDuration}초까지 내보낼 수 있습니다.`);
  }

  const canvas = document.createElement("canvas");
  canvas.width = resolution.width;
  canvas.height = resolution.height;
  const context = canvas.getContext("2d", { alpha: false });
  const stream = canvas.captureStream?.(60);

  if (!context || !stream) throw new Error("이 브라우저에서는 캔버스 녹화를 시작할 수 없습니다.");

  const chunks = [];
  let recorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType: format.mimeType,
      videoBitsPerSecond: resolution.bitrate,
    });
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
  const durationMs = Number(settings.duration) * 1000;

  return new Promise((resolve, reject) => {
    let animationFrame = null;
    let aborted = false;
    let cleaned = false;

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      signal?.removeEventListener("abort", abort);
      stream.getTracks().forEach((track) => track.stop());
    };

    const abort = () => {
      aborted = true;
      if (recorder.state !== "inactive") recorder.stop();
    };

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("error", (event) => {
      cleanup();
      reject(event.error || new Error("영상 녹화 중 오류가 발생했습니다."));
    });
    recorder.addEventListener("stop", async () => {
      cleanup();
      if (aborted) {
        reject(new DOMException("영상 내보내기가 취소되었습니다.", "AbortError"));
        return;
      }
      const blob = new Blob(chunks, { type: format.mimeType });
      try {
        await assertFinalCutCompatibleRecording(blob, format);
        resolve({
          blob,
          extension: format.extension,
          formatLabel: format.label,
        });
      } catch (error) {
        reject(error);
      }
    });

    if (signal?.aborted) {
      cleanup();
      reject(new DOMException("영상 내보내기가 취소되었습니다.", "AbortError"));
      return;
    }

    signal?.addEventListener("abort", abort, { once: true });
    drawClockFrame(context, settings, 0);
    try {
      recorder.start(250);
    } catch (error) {
      cleanup();
      reject(error);
      return;
    }
    const startedAt = performance.now();

    const render = (now) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      drawClockFrame(context, settings, progress);
      onProgress?.(progress);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(render);
      } else {
        animationFrame = null;
        if (recorder.state !== "inactive") recorder.stop();
      }
    };

    animationFrame = requestAnimationFrame(render);
  });
}

export function downloadRecording({ blob, extension }, start, end) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `flip-clock_${start.replaceAll(":", "-")}_${end.replaceAll(":", "-")}.${extension}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
