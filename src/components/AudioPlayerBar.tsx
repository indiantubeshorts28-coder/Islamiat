import { Download, Pause, Play, Volume2, X } from "lucide-react";
import type { AudioTrackInfo } from "../types";
import { formatFileSize, formatTime, triggerFileDownload } from "../utils/audioHelper";

interface AudioPlayerBarProps {
  track: AudioTrackInfo | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onChangeRate: () => void;
  onClose: () => void;
}

export function AudioPlayerBar({
  track,
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  onTogglePlay,
  onSeek,
  onChangeRate,
  onClose,
}: AudioPlayerBarProps) {
  if (!track) return null;

  const effectiveDuration = duration > 0 ? duration : track.durationSec || 1;
  const progressPct = Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100));

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-40 bg-[#FBF9F5]/95 backdrop-blur-md border-t border-[#D6CEBE] shadow-sm"
      role="region"
      aria-label="آڈیو پلیئر"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
        {/* Track Info + Play Control */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onTogglePlay}
            className="w-10 h-10 shrink-0 rounded-full bg-[#14532D] text-white hover:bg-[#166534] transition-colors flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14532D]"
            aria-label={isPlaying ? "روکیں" : "چلائیں"}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#1C1917] truncate">
              <Volume2 className="w-3.5 h-3.5 text-[#14532D] shrink-0 hidden sm:inline" />
              <span className="truncate">{track.titleUrdu}</span>
            </div>
            <p className="text-xs text-[#57534E] truncate hidden sm:block">
              {track.subtitleUrdu}
            </p>
          </div>
        </div>

        {/* Scrubber */}
        <div className="flex-1 max-w-xl hidden md:flex items-center gap-3" dir="ltr">
          <span className="text-xs text-[#57534E] font-mono-nums w-11 text-right shrink-0">
            {formatTime(currentTime)}
          </span>
          <div className="relative flex-1 flex items-center">
            <input
              type="range"
              min={0}
              max={effectiveDuration}
              step={0.25}
              value={Math.min(currentTime, effectiveDuration)}
              onChange={(e) => onSeek(Number(e.target.value))}
              aria-label="آڈیو ٹائم لائن"
              className="w-full h-1.5 bg-[#E2DCD0] rounded-lg appearance-none cursor-pointer accent-[#14532D]"
              style={{
                background: `linear-gradient(to right, #14532D ${progressPct}%, #E2DCD0 ${progressPct}%)`,
              }}
            />
          </div>
          <span className="text-xs text-[#57534E] font-mono-nums w-11 shrink-0">
            {formatTime(effectiveDuration)}
          </span>
        </div>

        {/* Speed + Download + Close */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onChangeRate}
            className="px-2.5 py-1.5 text-xs font-medium font-mono-nums text-[#292524] bg-[#F3EFE6] hover:bg-[#EBE6DF] border border-[#E2DCD0] rounded-lg transition-colors whitespace-nowrap shrink-0"
            title="رفتار تبدیل کریں"
          >
            {playbackRate}x
          </button>

          <button
            type="button"
            onClick={() =>
              triggerFileDownload(track.downloadUrl, `${track.itemId}.mp3`)
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#14532D] bg-[#14532D]/10 hover:bg-[#14532D]/15 border border-[#14532D]/20 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>ڈاؤن لوڈ</span>
            <span className="hidden sm:inline font-mono-nums text-[11px] opacity-80">
              ({formatFileSize(track.sizeBytes)})
            </span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#78716C] hover:text-[#1C1917] rounded-lg hover:bg-[#F3EFE6] transition-colors"
            aria-label="پلیئر بند کریں"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile Scrubber Row */}
      <div className="md:hidden px-4 pb-2 flex items-center gap-2" dir="ltr">
        <span className="text-[11px] text-[#57534E] font-mono-nums shrink-0">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={effectiveDuration}
          step={0.25}
          value={Math.min(currentTime, effectiveDuration)}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="آڈیو ٹائم لائن"
          className="w-full h-1 bg-[#E2DCD0] rounded-lg appearance-none cursor-pointer accent-[#14532D]"
        />
        <span className="text-[11px] text-[#57534E] font-mono-nums shrink-0">
          {formatTime(effectiveDuration)}
        </span>
      </div>
    </div>
  );
}
