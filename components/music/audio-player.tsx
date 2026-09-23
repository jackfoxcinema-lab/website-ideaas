"use client";

import * as React from "react";

import { Icons } from "@/components/common/icons";
import { usePlayer } from "@/components/music/player-provider";
import { waveformBars } from "@/lib/waveform";
import { cn, formatTime } from "@/lib/utils";

interface AudioPlayerProps {
  /** Stable id — seeds the waveform and coordinates single playback. */
  id: string;
  src: string;
  title: string;
  /** Fewer bars for compact rows. */
  bars?: number;
  className?: string;
}

export function AudioPlayer({
  id,
  src,
  title,
  bars = 64,
  className,
}: AudioPlayerProps) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const { activeId, claim, release } = usePlayer();

  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [failed, setFailed] = React.useState(false);

  // Same id always draws the same shape, server and client alike.
  const peaks = React.useMemo(() => waveformBars(id, bars), [id, bars]);

  // Metadata often lands before React attaches onLoadedMetadata (cached files,
  // fast local responses). Without this the duration stays 0, which also
  // leaves `progress` at 0 and the waveform never fills.
  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.readyState >= 1 && Number.isFinite(audio.duration)) {
      setDuration(audio.duration);
    }
  }, []);

  // Another player took over — stop this one.
  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (activeId !== id && !audio.paused) {
      audio.pause();
    }
  }, [activeId, id]);

  const progress = duration > 0 ? currentTime / duration : 0;

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || failed) return;

    if (audio.paused) {
      claim(id);
      // A rejected play() (autoplay policy, missing file) must not leave the
      // button stuck in a playing state.
      void audio.play().catch(() => {
        setIsPlaying(false);
        release(id);
      });
    } else {
      audio.pause();
    }
  }

  function seekToFraction(fraction: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    const clamped = Math.min(1, Math.max(0, fraction));
    audio.currentTime = clamped * audio.duration;
    setCurrentTime(audio.currentTime);
  }

  function handleSeekFromEvent(clientX: number) {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    seekToFraction((clientX - rect.left) / rect.width);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    const audio = audioRef.current;
    if (!audio) return;

    const step = 5;
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + step);
        setCurrentTime(audio.currentTime);
        break;
      case "ArrowLeft":
        event.preventDefault();
        audio.currentTime = Math.max(0, audio.currentTime - step);
        setCurrentTime(audio.currentTime);
        break;
      case "Home":
        event.preventDefault();
        seekToFraction(0);
        break;
      case "End":
        event.preventDefault();
        seekToFraction(0.99);
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        togglePlay();
        break;
    }
  }

  if (!src) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 text-muted-foreground/70",
          className
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-border">
          <Icons.play className="h-3.5 w-3.5" />
        </span>
        <span className="label normal-case tracking-normal">
          Audio coming soon
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3 sm:gap-4", className)}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => {
          setIsPlaying(true);
          claim(id);
        }}
        onPause={() => {
          setIsPlaying(false);
          release(id);
        }}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
          release(id);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onError={() => setFailed(true)}
      />

      <button
        type="button"
        onClick={togglePlay}
        disabled={failed}
        aria-label={`${isPlaying ? "Pause" : "Play"} ${title}`}
        className={cn(
          "group flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors",
          "border-border bg-transparent text-foreground",
          "hover:border-accent hover:bg-accent hover:text-accent-foreground",
          "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border",
          "disabled:hover:bg-transparent disabled:hover:text-foreground"
        )}
      >
        {isPlaying ? (
          <Icons.pause className="h-3.5 w-3.5" />
        ) : (
          <Icons.play className="h-3.5 w-3.5 translate-x-[1px]" />
        )}
      </button>

      {failed ? (
        <span className="label normal-case tracking-normal text-muted-foreground/70">
          Couldn&apos;t load this file
        </span>
      ) : (
        <>
          <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label={`Seek ${title}`}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration) || 0}
            aria-valuenow={Math.round(currentTime)}
            aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
            onKeyDown={handleKeyDown}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              handleSeekFromEvent(e.clientX);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                handleSeekFromEvent(e.clientX);
              }
            }}
            className="flex h-10 flex-1 cursor-pointer touch-none items-center gap-[2px] rounded-sm"
          >
            {peaks.map((peak, i) => {
              const played = i / peaks.length < progress;
              return (
                <span
                  key={i}
                  aria-hidden="true"
                  style={{ height: `${Math.round(peak * 100)}%` }}
                  className={cn(
                    "min-h-[2px] flex-1 rounded-[1px] transition-colors duration-150",
                    played ? "bg-accent" : "bg-muted-foreground/30"
                  )}
                />
              );
            })}
          </div>

          <span className="shrink-0 font-mono text-[0.7rem] tabular-nums text-muted-foreground">
            {isPlaying || currentTime > 0
              ? formatTime(currentTime)
              : formatTime(duration)}
          </span>
        </>
      )}
    </div>
  );
}
