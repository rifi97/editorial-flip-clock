import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clampDuration,
  formatClockTime,
  interpolateClockTime,
  isClockTime,
  parseClockTime,
} from "./time.js";
import {
  colorsAreTooSimilar,
  downloadRecording,
  getAvailableRecorderFormat,
  getMaxExportDuration,
  normalizeHexColor,
  recordClockVideo,
} from "./videoExport.js";

const DEFAULTS = {
  start: "08:45:00",
  end: "12:15:30",
  duration: 3,
  direction: "up",
  easing: "linear",
  clockColor: "#f1e7d0",
  backgroundColor: "#00ff00",
  resolution: "1080p",
};

function readOutputSettings() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("output") !== "1") return null;

  const start = params.get("start") || DEFAULTS.start;
  const end = params.get("end") || DEFAULTS.end;

  return {
    start: isClockTime(start) ? start : DEFAULTS.start,
    end: isClockTime(end) ? end : DEFAULTS.end,
    duration: clampDuration(Number(params.get("duration")) || DEFAULTS.duration),
    direction: params.get("direction") === "down" ? "down" : "up",
    easing: params.get("easing") === "smooth" ? "smooth" : "linear",
    clockColor: normalizeHexColor(params.get("clockColor"), DEFAULTS.clockColor),
    backgroundColor: normalizeHexColor(params.get("backgroundColor"), DEFAULTS.backgroundColor),
  };
}

function SegmentedControl({ disabled, label, options, value, onChange }) {
  return (
    <fieldset className="control-group">
      <legend>{label}</legend>
      <div className="segmented-control">
        {options.map((option) => (
          <button
            className={value === option.value ? "is-selected" : ""}
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ColorControl({ disabled, label, value, onChange }) {
  return (
    <label className="color-field">
      <span>{label}</span>
      <span className="color-input-shell">
        <input
          type="color"
          aria-label={`${label} 색상`}
          disabled={disabled}
          value={value}
          onInput={(event) => onChange(event.currentTarget.value)}
        />
        <code>{value.toUpperCase()}</code>
      </span>
    </label>
  );
}

function ClockFace({ value, compact = false }) {
  return (
    <div className={compact ? "clock-face clock-face--compact" : "clock-face"}>
      <span className="clock-value" role="timer" aria-label={value}>
        {value.split("").map((character, index) => (
          <span
            className={character === ":" ? "clock-glyph clock-glyph--separator" : "clock-glyph"}
            aria-hidden="true"
            key={index}
          >
            {character}
          </span>
        ))}
      </span>
    </div>
  );
}

export function App() {
  const outputSettings = useMemo(readOutputSettings, []);
  const [start, setStart] = useState(outputSettings?.start || DEFAULTS.start);
  const [end, setEnd] = useState(outputSettings?.end || DEFAULTS.end);
  const [duration, setDuration] = useState(outputSettings?.duration || DEFAULTS.duration);
  const [direction, setDirection] = useState(outputSettings?.direction || DEFAULTS.direction);
  const [easing, setEasing] = useState(outputSettings?.easing || DEFAULTS.easing);
  const [clockColor, setClockColor] = useState(outputSettings?.clockColor || DEFAULTS.clockColor);
  const [backgroundColor, setBackgroundColor] = useState(
    outputSettings?.backgroundColor || DEFAULTS.backgroundColor,
  );
  const [resolution, setResolution] = useState(DEFAULTS.resolution);
  const [displaySeconds, setDisplaySeconds] = useState(() => parseClockTime(start));
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [exportState, setExportState] = useState({ status: "idle", progress: 0, message: "" });
  const animationFrame = useRef(null);
  const exportAbort = useRef(null);
  const exportProgressPercent = useRef(-1);
  const runState = useRef({ elapsed: 0, startedAt: 0 });
  const recorderFormat = useMemo(() => getAvailableRecorderFormat(resolution), [resolution]);
  const maxExportDuration = getMaxExportDuration(resolution);

  const stopFrame = useCallback(() => {
    if (animationFrame.current !== null) {
      cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    }
  }, []);

  const validate = useCallback(() => {
    if (!isClockTime(start) || !isClockTime(end)) {
      setError("시간은 HH:MM:SS 형식으로 입력해 주세요.");
      return false;
    }
    if (!Number.isFinite(Number(duration)) || Number(duration) < 0.1 || Number(duration) > 3600) {
      setError("진행 시간은 0.1초에서 3600초 사이여야 합니다.");
      return false;
    }
    setError("");
    return true;
  }, [duration, end, start]);

  const reset = useCallback(() => {
    stopFrame();
    runState.current = { elapsed: 0, startedAt: 0 };
    setDisplaySeconds(isClockTime(start) ? parseClockTime(start) : 0);
    setStatus("idle");
  }, [start, stopFrame]);

  const run = useCallback(() => {
    if (!validate()) return;

    if (status === "finished") {
      runState.current.elapsed = 0;
      setDisplaySeconds(parseClockTime(start));
    }

    const durationMs = clampDuration(Number(duration)) * 1000;
    const startSeconds = parseClockTime(start);
    const endSeconds = parseClockTime(end);
    runState.current.startedAt = performance.now() - runState.current.elapsed;
    setStatus("running");

    const tick = (now) => {
      const elapsed = Math.min(now - runState.current.startedAt, durationMs);
      const progress = elapsed / durationMs;
      runState.current.elapsed = elapsed;
      setDisplaySeconds(
        interpolateClockTime(startSeconds, endSeconds, progress, direction, easing),
      );

      if (progress < 1) {
        animationFrame.current = requestAnimationFrame(tick);
      } else {
        animationFrame.current = null;
        setDisplaySeconds(endSeconds);
        setStatus("finished");
      }
    };

    animationFrame.current = requestAnimationFrame(tick);
  }, [direction, duration, easing, end, start, status, validate]);

  const pause = useCallback(() => {
    stopFrame();
    setStatus("paused");
  }, [stopFrame]);

  useEffect(() => () => {
    stopFrame();
    exportAbort.current?.abort();
  }, [stopFrame]);

  useEffect(() => {
    if (status === "idle" && isClockTime(start)) {
      setDisplaySeconds(parseClockTime(start));
    }
  }, [start, status]);

  useEffect(() => {
    if (outputSettings && status === "idle") {
      const startTimer = window.setTimeout(run, 500);
      return () => window.clearTimeout(startTimer);
    }
  }, [outputSettings, run, status]);

  const openOutput = () => {
    if (!validate()) return;
    const params = new URLSearchParams({
      output: "1",
      start,
      end,
      duration: String(clampDuration(Number(duration))),
      direction,
      easing,
      clockColor,
      backgroundColor,
    });
    window.location.assign(`${window.location.pathname}?${params}`);
  };

  const exportVideo = async () => {
    if (exportState.status === "recording") {
      exportAbort.current?.abort();
      return;
    }
    if (!validate()) return;
    if (Number(duration) > maxExportDuration) {
      setExportState({
        status: "error",
        progress: 0,
        message: `${resolution === "4k" ? "4K" : "1080p"} 영상은 메모리 보호를 위해 최대 ${maxExportDuration}초까지 내보낼 수 있습니다.`,
      });
      return;
    }
    if (!recorderFormat) {
      setExportState({ status: "error", progress: 0, message: "이 브라우저는 영상 녹화를 지원하지 않습니다." });
      return;
    }

    stopFrame();
    runState.current = { elapsed: 0, startedAt: 0 };
    setStatus("idle");
    setDisplaySeconds(parseClockTime(start));
    const controller = new AbortController();
    exportAbort.current = controller;
    exportProgressPercent.current = 0;
    setExportState({ status: "recording", progress: 0, message: "영상 프레임을 녹화하고 있습니다." });

    try {
      const recording = await recordClockVideo(
        { start, end, duration: clampDuration(Number(duration)), direction, easing, clockColor, backgroundColor, resolution },
        {
          signal: controller.signal,
          onProgress: (progress) => {
            const percent = Math.round(progress * 100);
            if (percent === exportProgressPercent.current) return;
            exportProgressPercent.current = percent;
            setExportState({
              status: "recording",
              progress,
              message: "영상 프레임을 녹화하고 있습니다.",
            });
          },
        },
      );
      downloadRecording(recording, start, end);
      setExportState({
        status: "success",
        progress: 1,
        message: `${recording.formatLabel} 영상 다운로드가 완료되었습니다.`,
      });
    } catch (exportError) {
      if (exportError.name === "AbortError") {
        setExportState({ status: "idle", progress: 0, message: "영상 내보내기를 취소했습니다." });
      } else {
        setExportState({ status: "error", progress: 0, message: exportError.message });
      }
    } finally {
      exportAbort.current = null;
      exportProgressPercent.current = -1;
    }
  };

  const togglePlayback = status === "running" ? pause : run;
  const shownTime = formatClockTime(displaySeconds);
  const isExporting = exportState.status === "recording";
  const controlsLocked = status === "running" || status === "paused" || isExporting;
  const keyingWarning = colorsAreTooSimilar(clockColor, backgroundColor);
  const enterFullscreen = () => document.documentElement.requestFullscreen?.();

  if (outputSettings) {
    return (
      <main
        className="output-shell"
        style={{ "--clock-color": clockColor, "--clock-background": backgroundColor }}
      >
        <button
          className="output-view"
          type="button"
          aria-label={`전체 화면 출력, 현재 시간 ${shownTime}`}
          onClick={enterFullscreen}
        >
          <ClockFace value={shownTime} />
        </button>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="control-panel" aria-label="시계 애니메이션 설정">
        <header className="brand-block">
          <h1>플립 클록 생성기</h1>
          <p>영상에 사용할 애니메이션 디지털 시계</p>
        </header>

        <div className="field-stack">
          <label className="time-field">
            <span>시작 시간</span>
            <input
              aria-invalid={!isClockTime(start)}
              disabled={controlsLocked}
              inputMode="numeric"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>

          <label className="time-field">
            <span>도착 시간</span>
            <input
              aria-invalid={!isClockTime(end)}
              disabled={controlsLocked}
              inputMode="numeric"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>

          <label className="duration-field">
            <span>진행 시간</span>
            <span className="number-input">
              <input
                type="number"
                disabled={controlsLocked}
                min="0.1"
                max="3600"
                step="0.1"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
              <small>초</small>
            </span>
          </label>
        </div>

        <SegmentedControl
          label="시간 방향"
          disabled={controlsLocked}
          options={[{ label: "증가", value: "up" }, { label: "감소", value: "down" }]}
          value={direction}
          onChange={setDirection}
        />

        <SegmentedControl
          label="모션 곡선"
          disabled={controlsLocked}
          options={[{ label: "선형", value: "linear" }, { label: "부드럽게", value: "smooth" }]}
          value={easing}
          onChange={setEasing}
        />

        <fieldset className="control-group appearance-controls">
          <legend>화면 색상</legend>
          <div className="color-controls">
            <ColorControl
              label="시계"
              disabled={controlsLocked}
              value={clockColor}
              onChange={setClockColor}
            />
            <ColorControl
              label="배경"
              disabled={controlsLocked}
              value={backgroundColor}
              onChange={setBackgroundColor}
            />
          </div>
          {keyingWarning ? (
            <p className="keying-warning" role="status">
              시계와 배경색이 비슷해 키잉이 어려울 수 있습니다. 서로 다른 색을 선택해 주세요.
            </p>
          ) : null}
        </fieldset>

        <SegmentedControl
          label="내보내기 해상도"
          disabled={controlsLocked}
          options={[{ label: "1080p", value: "1080p" }, { label: "4K", value: "4k" }]}
          value={resolution}
          onChange={setResolution}
        />

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="primary-actions">
          <button className="run-button" type="button" onClick={togglePlayback} disabled={isExporting}>
            {status === "running" ? "일시정지" : status === "paused" ? "계속" : "실행"}
          </button>
          <button className="reset-button" type="button" onClick={reset} disabled={status === "idle"}>
            초기화
          </button>
        </div>

        <div className="export-actions">
          <button className="output-button" type="button" onClick={openOutput} disabled={controlsLocked}>
            출력 화면 열기
          </button>
          <button
            className={`export-button ${isExporting ? "is-recording" : ""}`}
            type="button"
            onClick={exportVideo}
            disabled={!recorderFormat && !isExporting}
          >
            {isExporting
              ? `내보내기 취소 · ${Math.round(exportState.progress * 100)}%`
              : `영상 내보내기${recorderFormat ? ` · ${recorderFormat.label}` : ""}`}
          </button>
        </div>

        {exportState.message ? (
          <p className={`export-status is-${exportState.status}`} role="status">
            {exportState.message}
          </p>
        ) : null}

        {recorderFormat?.extension === "webm" ? (
          <p className="compatibility-note">
            현재 브라우저는 WebM으로 저장합니다. Final Cut Pro에서 사용하려면 MP4 또는 ProRes로 변환해 주세요.
          </p>
        ) : null}

        <p className="keyboard-note">
          영상은 설정한 시간만큼 실시간으로 녹화됩니다. 내보내는 동안 이 탭을 화면에 유지해 주세요.
          {` ${resolution === "4k" ? "4K" : "1080p"}는 최대 ${maxExportDuration}초까지 지원합니다.`}
        </p>
      </aside>

      <section
        className="stage"
        aria-label="시계 미리보기"
        style={{ "--clock-color": clockColor, "--clock-background": backgroundColor }}
      >
        <div className="preview-frame">
          <ClockFace value={shownTime} />
        </div>

        <div className="range-strip" aria-label="시작 및 도착 시간">
          <div className="range-time">
            <span>START</span>
            <ClockFace value={start} compact />
          </div>
          <div className={`direction-line ${direction === "down" ? "is-reversed" : ""}`} aria-hidden="true">
            <span />
          </div>
          <div className="range-time range-time--end">
            <span>END</span>
            <ClockFace value={end} compact />
          </div>
        </div>
      </section>
    </main>
  );
}
