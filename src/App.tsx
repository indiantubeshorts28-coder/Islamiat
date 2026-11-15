import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Download,
  Loader2,
  Pause,
  Play,
  Plus,
  Search,
  Volume2,
} from "lucide-react";
import manuscriptImage from "./assets/images/islamic_manuscript_archive_1794744002026.jpg";
import { AddChapterModal } from "./components/AddChapterModal";
import { AudioPlayerBar } from "./components/AudioPlayerBar";
import { GhazwaTable } from "./components/GhazwaTable";
import { INITIAL_CHAPTERS, VOICE_OPTIONS } from "./data/chapters";
import type { AudioTrackInfo, Chapter, ChapterSection, VoiceId } from "./types";
import {
  buildChapterSpeechText,
  buildSectionSpeechText,
  triggerFileDownload,
} from "./utils/audioHelper";

const CUSTOM_CHAPTERS_STORAGE_KEY = "seerat_custom_chapters_v1";
const PLAYBACK_RATES = [1, 1.25, 1.5];

export default function App() {
  const [customChapters, setCustomChapters] = useState<Chapter[]>(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_CHAPTERS_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as Chapter[]) : [];
    } catch {
      return [];
    }
  });

  const chapters = useMemo(
    () => [...INITIAL_CHAPTERS, ...customChapters],
    [customChapters]
  );

  const [activeChapterId, setActiveChapterId] = useState<string>(
    INITIAL_CHAPTERS[0].id
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVoice, setSelectedVoice] = useState<VoiceId>("Kore");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [heroImageError, setHeroImageError] = useState(false);

  // Audio playback & synthesis state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [trackCache, setTrackCache] = useState<Record<string, AudioTrackInfo>>({});
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<"play" | "download" | null>(
    null
  );
  const [audioError, setAudioError] = useState<string | null>(null);
  const [quotaFallbackItem, setQuotaFallbackItem] = useState<{
    itemId: string;
    titleUrdu: string;
    speechText: string;
  } | null>(null);
  const [browserSpeakingId, setBrowserSpeakingId] = useState<string | null>(
    null
  );

  const [currentTrack, setCurrentTrack] = useState<AudioTrackInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRateIndex, setPlaybackRateIndex] = useState(0);

  const activeChapter = useMemo(
    () => chapters.find((ch) => ch.id === activeChapterId) ?? chapters[0],
    [chapters, activeChapterId]
  );

  const filteredChapters = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return chapters;
    return chapters.filter(
      (ch) =>
        ch.titleUrdu.includes(q) ||
        ch.subtitleUrdu.includes(q) ||
        ch.categoryUrdu.includes(q) ||
        ch.sections.some(
          (sec) =>
            sec.titleUrdu.includes(q) ||
            sec.paragraphs.some((p) => p.includes(q))
        )
    );
  }, [chapters, searchQuery]);

  useEffect(() => {
    try {
      localStorage.setItem(
        CUSTOM_CHAPTERS_STORAGE_KEY,
        JSON.stringify(customChapters)
      );
    } catch {
      // Ignore localStorage quota issues
    }
  }, [customChapters]);

  // Attach HTMLAudioElement listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration || 0);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = PLAYBACK_RATES[playbackRateIndex];
    }
  }, [playbackRateIndex, currentTrack]);

  const stopBrowserSpeech = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setBrowserSpeakingId(null);
  };

  const speakWithBrowserFallback = (
    itemId: string,
    speechText: string
  ) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setAudioError("آپ کا براؤزر بلٹ اِن آواز (Speech Synthesis) کو سپورٹ نہیں کرتا۔");
      return;
    }

    if (browserSpeakingId === itemId) {
      stopBrowserSpeech();
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }
    window.speechSynthesis.cancel();

    const voices = window.speechSynthesis.getVoices();
    const urduVoice =
      voices.find((v) => v.lang.toLowerCase().startsWith("ur")) ||
      voices.find((v) => v.lang.toLowerCase().startsWith("hi")) ||
      voices.find((v) => v.lang.toLowerCase().startsWith("ar")) ||
      null;

    const sentences = speechText
      .split(/(?<=[۔.؟?!\n])\s*/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (sentences.length === 0) return;

    setBrowserSpeakingId(itemId);
    let idx = 0;

    const speakNext = () => {
      if (idx >= sentences.length) {
        setBrowserSpeakingId(null);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(sentences[idx]);
      utterance.lang = urduVoice?.lang || "ur-PK";
      if (urduVoice) utterance.voice = urduVoice;
      utterance.rate = PLAYBACK_RATES[playbackRateIndex];
      utterance.onend = () => {
        idx += 1;
        speakNext();
      };
      utterance.onerror = () => {
        setBrowserSpeakingId(null);
      };
      window.speechSynthesis.speak(utterance);
    };

    speakNext();
  };

  const ensureGeneratedTrack = async (
    itemId: string,
    titleUrdu: string,
    subtitleUrdu: string,
    speechText: string
  ): Promise<AudioTrackInfo | null> => {
    const cacheKey = `${itemId}__${selectedVoice}`;
    if (trackCache[cacheKey]) {
      return trackCache[cacheKey];
    }

    setAudioError(null);
    setQuotaFallbackItem(null);
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          text: speechText,
          voiceName: selectedVoice,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 429 || data.errorCode === "QUOTA_EXCEEDED") {
          setQuotaFallbackItem({ itemId, titleUrdu, speechText });
        }
        throw new Error(data.error || "آڈیو تیار کرنے میں خرابی آئی۔");
      }

      const track: AudioTrackInfo = {
        itemId,
        titleUrdu,
        subtitleUrdu,
        audioUrl: data.audioUrl,
        downloadUrl: data.downloadUrl,
        sizeBytes: data.sizeBytes,
        durationSec: data.durationSec,
        voiceName: selectedVoice,
      };

      setTrackCache((prev) => ({ ...prev, [cacheKey]: track }));
      return track;
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "آڈیو سرور سے رابطے میں خرابی پیش آئی۔";
      setAudioError(msg);
      return null;
    }
  };

  const handlePlayItem = async (
    itemId: string,
    titleUrdu: string,
    subtitleUrdu: string,
    speechText: string
  ) => {
    // If same track + voice is already loaded, simply toggle play/pause
    if (
      currentTrack &&
      currentTrack.itemId === itemId &&
      currentTrack.voiceName === selectedVoice &&
      audioRef.current
    ) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        try {
          await audioRef.current.play();
        } catch {
          setAudioError("آڈیو چلانے میں دشواری پیش آئی، براہِ کرم دوبارہ کوشش کریں۔");
        }
      }
      return;
    }

    setLoadingItemId(itemId);
    setLoadingAction("play");

    const track = await ensureGeneratedTrack(
      itemId,
      titleUrdu,
      subtitleUrdu,
      speechText
    );

    setLoadingItemId(null);
    setLoadingAction(null);

    if (!track || !audioRef.current) return;

    stopBrowserSpeech();
    setCurrentTrack(track);
    setCurrentTime(0);
    setDuration(track.durationSec);
    audioRef.current.src = track.audioUrl;
    audioRef.current.load();
    audioRef.current.playbackRate = PLAYBACK_RATES[playbackRateIndex];

    try {
      await audioRef.current.play();
    } catch {
      setAudioError("آڈیو پلے بیک شروع کرنے کے لیے دوبارہ کلک کریں۔");
    }
  };

  const handleDownloadItem = async (
    itemId: string,
    titleUrdu: string,
    subtitleUrdu: string,
    speechText: string
  ) => {
    setLoadingItemId(itemId);
    setLoadingAction("download");

    const track = await ensureGeneratedTrack(
      itemId,
      titleUrdu,
      subtitleUrdu,
      speechText
    );

    setLoadingItemId(null);
    setLoadingAction(null);

    if (!track) return;
    triggerFileDownload(track.downloadUrl, `${itemId}.mp3`);
  };

  const handlePlayChapter = (chapter: Chapter) => {
    handlePlayItem(
      chapter.id,
      `باب ${chapter.number}: ${chapter.titleUrdu}`,
      chapter.subtitleUrdu,
      buildChapterSpeechText(chapter)
    );
  };

  const handleDownloadChapter = (chapter: Chapter) => {
    handleDownloadItem(
      chapter.id,
      `باب ${chapter.number}: ${chapter.titleUrdu}`,
      chapter.subtitleUrdu,
      buildChapterSpeechText(chapter)
    );
  };

  const handlePlaySection = (chapter: Chapter, section: ChapterSection) => {
    handlePlayItem(
      section.id,
      section.titleUrdu,
      `باب ${chapter.number}: ${chapter.titleUrdu}`,
      buildSectionSpeechText(section)
    );
  };

  const handleDownloadSection = (chapter: Chapter, section: ChapterSection) => {
    handleDownloadItem(
      section.id,
      section.titleUrdu,
      `باب ${chapter.number}: ${chapter.titleUrdu}`,
      buildSectionSpeechText(section)
    );
  };

  const handleSeek = (time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleTogglePlayBar = async () => {
    if (!audioRef.current || !currentTrack) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      try {
        await audioRef.current.play();
      } catch {
        setAudioError("آڈیو پلے بیک دوبارہ شروع نہ ہو سکا، براہِ کرم دوبارہ کوشش کریں۔");
      }
    }
  };

  const handleJumpToTable = () => {
    setActiveChapterId("chapter-7");
    setTimeout(() => {
      document
        .getElementById("ghazwa-table")
        ?.scrollIntoView({ behavior: "smooth" });
    }, 80);
  };

  const handleAddCustomChapter = (newChapter: Chapter) => {
    setCustomChapters((prev) => [...prev, newChapter]);
    setActiveChapterId(newChapter.id);
    setTimeout(() => {
      document
        .getElementById("reading-workspace")
        ?.scrollIntoView({ behavior: "smooth" });
    }, 80);
  };

  const isCurrentItemPlaying = (itemId: string) =>
    Boolean(
      isPlaying &&
        currentTrack &&
        currentTrack.itemId === itemId &&
        currentTrack.voiceName === selectedVoice
    );

  const isItemLoading = (itemId: string, action?: "play" | "download") =>
    loadingItemId === itemId && (!action || loadingAction === action);

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] text-[#1C1917]">
      <audio
        ref={audioRef}
        preload="metadata"
        className="hidden"
        onError={() => {
          setIsPlaying(false);
          setAudioError("آڈیو فائل لوڈ کرنے میں مسئلہ پیش آیا، براہِ کرم دوبارہ کوشش کریں۔");
        }}
      />

      {/* Top Navigation Bar — 3-Zone Contract */}
      <header className="sticky top-0 z-30 bg-[#FBF9F5]/95 backdrop-blur-sm border-b border-[#E2DCD0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#top"
            className="font-urdu-display text-xl font-bold text-[#1C1917] whitespace-nowrap shrink-0"
          >
            سیرت و اسلامیات
          </a>

          {/* Zone 2: Concise Single-Line Nav Links */}
          <nav
            aria-label="بنیادی نیویگیشن"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-[#57534E]"
          >
            <a
              href="#reading-workspace"
              className="hover:text-[#14532D] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              ابواب
            </a>
            <a
              href="#chapter-reader"
              className="hover:text-[#14532D] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              مکمل مطالعہ
            </a>
            <button
              type="button"
              onClick={handleJumpToTable}
              className="hover:text-[#14532D] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              غزوات کا جدول
            </button>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="hover:text-[#14532D] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              نیا باب شامل کریں
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => handlePlayChapter(activeChapter)}
              disabled={loadingItemId === activeChapter.id}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#14532D] hover:bg-[#166534] disabled:opacity-70 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isItemLoading(activeChapter.id, "play") ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isCurrentItemPlaying(activeChapter.id) ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              <span>
                {isCurrentItemPlaying(activeChapter.id)
                  ? "آڈیو روکیں"
                  : "موجودہ باب سنیں"}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Editorial Hero Section */}
      <section
        id="top"
        className="border-b border-[#E2DCD0] bg-[#F3EFE6]/55"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-center">
            <p className="text-xs text-[#78350F] font-medium mb-3">
              مستند اردو آرکائیو · {chapters.length} ابواب · ۸ غزواتِ نبوی ﷺ
            </p>
            <h1 className="font-urdu-display text-3xl sm:text-4xl lg:text-[42px] font-bold text-[#1C1917] max-w-2xl [text-wrap:balance]">
              اسلامی تعلیمات، سیرتِ طیبہ اور غزوات کی اردو آڈیو لائبریری
            </h1>
            <p className="mt-4 text-base sm:text-[17px] text-[#44403C] max-w-2xl leading-[2]">
              تمام ابواب کو مستند اردو رسم الخط میں منتقل کر کے باب وار ترتیب دیا گیا ہے۔
              آپ ہر باب یا کسی بھی غزوے کو براہِ راست سن سکتے ہیں اور اعلیٰ معیار کی{" "}
              <span className="font-mono-nums text-sm text-[#14532D] font-semibold">
                MP3
              </span>{" "}
              آڈیو فائل ڈاؤن لوڈ کر سکتے ہیں۔
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a
                href="#reading-workspace"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <BookOpen className="w-4 h-4" />
                <span>ابواب کا مطالعہ کریں</span>
              </a>

              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[#1C1917] bg-white hover:bg-[#F3EFE6] border border-[#D6CEBE] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>رومن اردو سے نیا باب شامل کریں</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col">
            <div className="relative flex-1 min-h-[220px] lg:min-h-[290px] rounded-xl overflow-hidden border border-[#D6CEBE] bg-[#EBE6DF]">
              {!heroImageError ? (
                <img
                  src={manuscriptImage}
                  alt="تاریخی اسلامی مخطوطہ اور مطالعہ گاہ"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImageError(true)}
                  className="w-full h-full lg:h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-[#EBE6DF] to-[#FBF9F5]">
                  <BookOpen className="w-10 h-10 text-[#14532D]/70 mb-2" />
                  <p className="font-urdu-display text-lg text-[#1C1917]">
                    سیرت و اسلامیات آڈیو آرکائیو
                  </p>
                </div>
              )}
            </div>
            <p className="text-xs text-[#78716C] mt-2.5">
              تصویر ۱ — اردو رسم الخط میں منتقل شدہ باب وار علمی و تاریخی ذخیرہ
            </p>
          </div>
        </div>
      </section>

      {/* Main Two-Column Reading & Audio Workspace */}
      <main
        id="reading-workspace"
        className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-10 lg:py-12 pb-32"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          {/* Chapter Index Sidebar */}
          <aside className="lg:col-span-4 lg:sticky lg:top-20 space-y-4">
            <div className="bg-white border border-[#E2DCD0] rounded-xl p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="font-urdu-display text-lg font-bold text-[#1C1917]">
                  فہرستِ ابواب
                </h2>
                <span className="text-xs text-[#78716C] font-mono-nums">
                  {chapters.length} ابواب
                </span>
              </div>

              <div className="relative mb-4">
                <Search className="w-4 h-4 text-[#78716C] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابواب یا غزوہ تلاش کریں..."
                  aria-label="ابواب میں تلاش کریں"
                  className="w-full pr-9 pl-3 py-2 text-sm bg-[#FBF9F5] border border-[#E2DCD0] rounded-lg focus:outline-none focus:border-[#14532D]"
                />
              </div>

              <div className="divide-y divide-[#E2DCD0]">
                {filteredChapters.length === 0 ? (
                  <p className="py-6 text-center text-sm text-[#78716C]">
                    تلاش کے مطابق کوئی باب نہیں ملا۔
                  </p>
                ) : (
                  filteredChapters.map((chapter) => {
                    const isSelected = chapter.id === activeChapter.id;
                    const playingThis = isCurrentItemPlaying(chapter.id);
                    const loadingThisPlay = isItemLoading(chapter.id, "play");
                    const loadingThisDownload = isItemLoading(
                      chapter.id,
                      "download"
                    );

                    return (
                      <div
                        key={chapter.id}
                        className={`py-3 px-2.5 -mx-2.5 rounded-lg transition-colors ${
                          isSelected ? "bg-[#F3EFE6]" : "hover:bg-[#FBF9F5]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveChapterId(chapter.id)}
                            className="text-right flex-1 min-w-0 cursor-pointer"
                          >
                            <div className="text-xs text-[#78716C] flex items-center gap-1.5">
                              <span className="font-mono-nums">
                                باب {chapter.number}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="truncate">{chapter.categoryUrdu}</span>
                            </div>
                            <h3
                              className={`mt-0.5 text-[15px] font-semibold leading-snug ${
                                isSelected ? "text-[#14532D]" : "text-[#1C1917]"
                              }`}
                            >
                              {chapter.titleUrdu}
                            </h3>
                          </button>

                          <div className="flex items-center gap-1 shrink-0 pt-1">
                            <button
                              type="button"
                              onClick={() => handlePlayChapter(chapter)}
                              disabled={loadingItemId === chapter.id}
                              title="باب سنیں"
                              aria-label={`${chapter.titleUrdu} سنیں`}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                                playingThis
                                  ? "bg-[#14532D] text-white"
                                  : "text-[#14532D] hover:bg-[#14532D]/10"
                              }`}
                            >
                              {loadingThisPlay ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : playingThis ? (
                                <Pause className="w-3.5 h-3.5" />
                              ) : (
                                <Play className="w-3.5 h-3.5 fill-current" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDownloadChapter(chapter)}
                              disabled={loadingItemId === chapter.id}
                              title="آڈیو ڈاؤن لوڈ کریں"
                              aria-label={`${chapter.titleUrdu} کی آڈیو ڈاؤن لوڈ کریں`}
                              className="w-8 h-8 rounded-lg text-[#57534E] hover:text-[#1C1917] hover:bg-[#EBE6DF] flex items-center justify-center transition-colors cursor-pointer"
                            >
                              {loadingThisDownload ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Download className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Quick Ghazwat sub-links when Chapter 7 is selected */}
                        {isSelected && chapter.sections.length > 3 && (
                          <div className="mt-2.5 pt-2.5 border-t border-[#E2DCD0] flex flex-wrap gap-1.5">
                            {chapter.sections.map((sec) => (
                              <a
                                key={sec.id}
                                href={`#${sec.id}`}
                                className="text-xs px-2.5 py-1 rounded-md bg-white border border-[#E2DCD0] text-[#44403C] hover:border-[#14532D] hover:text-[#14532D] transition-colors whitespace-nowrap"
                              >
                                {sec.titleUrdu.replace(/^غزوہ \d+:\s*/, "")}
                              </a>
                            ))}
                            {chapter.hasComparisonTable && (
                              <a
                                href="#ghazwa-table"
                                className="text-xs px-2.5 py-1 rounded-md bg-white border border-[#E2DCD0] text-[#78350F] hover:border-[#78350F] transition-colors whitespace-nowrap"
                              >
                                تقابلی جدول
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </aside>

          {/* Main Editorial Reading & Audio Studio */}
          <article
            id="chapter-reader"
            className="lg:col-span-8 bg-white border border-[#E2DCD0] rounded-2xl p-6 sm:p-10"
          >
            {/* Chapter Header */}
            <header className="pb-6 border-b border-[#E2DCD0]">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#78350F]">
                <span className="font-mono-nums font-medium">
                  باب {activeChapter.number}
                </span>
                <span aria-hidden="true">·</span>
                <span>{activeChapter.categoryUrdu}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-nums">
                  تخمینی دورانیہ {activeChapter.estimatedMinutes} منٹ
                </span>
              </div>

              <h2 className="mt-2 font-urdu-display text-3xl sm:text-4xl font-bold text-[#1C1917] [text-wrap:balance]">
                {activeChapter.titleUrdu}
              </h2>
              <p className="mt-2 text-base text-[#57534E]">
                {activeChapter.subtitleUrdu}
              </p>

              {/* Audio Studio Toolbar */}
              <div className="mt-6 pt-5 border-t border-[#E2DCD0] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePlayChapter(activeChapter)}
                    disabled={loadingItemId === activeChapter.id}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#14532D] hover:bg-[#166534] disabled:opacity-65 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isItemLoading(activeChapter.id, "play") ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isCurrentItemPlaying(activeChapter.id) ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4 fill-current" />
                    )}
                    <span>
                      {isItemLoading(activeChapter.id, "play")
                        ? "آڈیو تیار ہو رہی ہے..."
                        : isCurrentItemPlaying(activeChapter.id)
                        ? "روکیں"
                        : "مکمل باب سنیں"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadChapter(activeChapter)}
                    disabled={loadingItemId === activeChapter.id}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#1C1917] bg-[#F3EFE6] hover:bg-[#EBE6DF] border border-[#D6CEBE] disabled:opacity-65 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isItemLoading(activeChapter.id, "download") ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span>
                      {isItemLoading(activeChapter.id, "download")
                        ? "تیار ہو رہا ہے..."
                        : "آڈیو ڈاؤن لوڈ (.mp3)"}
                    </span>
                  </button>
                </div>

                {/* Voice Selector */}
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-[#57534E] shrink-0" />
                  <select
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value as VoiceId)}
                    aria-label="آواز منتخب کریں"
                    className="px-3 py-2 text-xs sm:text-sm bg-[#FBF9F5] border border-[#D6CEBE] rounded-lg text-[#1C1917] focus:outline-none focus:border-[#14532D]"
                  >
                    {VOICE_OPTIONS.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.labelUrdu}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {audioError && (
                <div
                  role="alert"
                  className="mt-4 p-4 rounded-xl bg-[#9A3412]/10 border border-[#9A3412]/25 text-sm text-[#7C2D12] space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="leading-relaxed">{audioError}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAudioError(null);
                        setQuotaFallbackItem(null);
                      }}
                      className="text-xs underline shrink-0 cursor-pointer"
                    >
                      بند کریں
                    </button>
                  </div>

                  {quotaFallbackItem && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          speakWithBrowserFallback(
                            quotaFallbackItem.itemId,
                            quotaFallbackItem.speechText
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg transition-colors cursor-pointer"
                      >
                        {browserSpeakingId === quotaFallbackItem.itemId ? (
                          <>
                            <Pause className="w-3.5 h-3.5" />
                            <span>براؤزر آواز روکیں</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>براؤزر کی آواز میں سنیں ({quotaFallbackItem.titleUrdu})</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </header>

            {/* Chapter Sections */}
            <div className="divide-y divide-[#E2DCD0]">
              {activeChapter.sections.map((section) => {
                const secPlaying = isCurrentItemPlaying(section.id);
                const secPlayLoading = isItemLoading(section.id, "play");
                const secDlLoading = isItemLoading(section.id, "download");

                return (
                  <section
                    key={section.id}
                    id={section.id}
                    className="py-8 first:pt-7 last:pb-2 scroll-mt-24"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                      <div>
                        {section.metaUrdu && (
                          <p className="text-xs text-[#78350F] font-mono-nums mb-1">
                            {section.metaUrdu}
                          </p>
                        )}
                        <h3 className="font-urdu-display text-2xl font-bold text-[#1C1917]">
                          {section.titleUrdu}
                        </h3>
                      </div>

                      {/* Per-Section Play & Download (ideal for Ghazwat & subtopics) */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handlePlaySection(activeChapter, section)}
                          disabled={loadingItemId === section.id}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            secPlaying
                              ? "bg-[#14532D] text-white border-[#14532D]"
                              : "bg-[#FBF9F5] text-[#14532D] border-[#D6CEBE] hover:border-[#14532D]"
                          }`}
                        >
                          {secPlayLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : secPlaying ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current" />
                          )}
                          <span>{secPlaying ? "روکیں" : "حصہ سنیں"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleDownloadSection(activeChapter, section)
                          }
                          disabled={loadingItemId === section.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#292524] bg-[#FBF9F5] hover:bg-[#F3EFE6] border border-[#D6CEBE] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {secDlLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          <span>ڈاؤن لوڈ</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4 max-w-prose font-urdu-body text-[18px] leading-[2.15] text-[#292524]">
                      {section.paragraphs.map((paragraph, idx) => (
                        <p key={idx}>{paragraph}</p>
                      ))}

                      {section.bulletPoints && section.bulletPoints.length > 0 && (
                        <ul className="space-y-3 pr-5 list-disc marker:text-[#14532D]">
                          {section.bulletPoints.map((point, idx) => (
                            <li key={idx}>{point}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>

            {activeChapter.hasComparisonTable && <GhazwaTable />}

            {/* Chapter Next / Previous Footer Navigation */}
            <footer className="mt-10 pt-6 border-t border-[#E2DCD0] flex flex-wrap items-center justify-between gap-4">
              {(() => {
                const idx = chapters.findIndex((c) => c.id === activeChapter.id);
                const prev = idx > 0 ? chapters[idx - 1] : null;
                const next = idx < chapters.length - 1 ? chapters[idx + 1] : null;

                return (
                  <>
                    <div>
                      {prev && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveChapterId(prev.id);
                            window.scrollTo({ top: 320, behavior: "smooth" });
                          }}
                          className="text-right px-4 py-2.5 rounded-lg border border-[#E2DCD0] hover:bg-[#FBF9F5] transition-colors cursor-pointer"
                        >
                          <span className="block text-xs text-[#78716C]">
                            پچھلا باب
                          </span>
                          <span className="text-sm font-semibold text-[#1C1917]">
                            باب {prev.number}: {prev.titleUrdu}
                          </span>
                        </button>
                      )}
                    </div>

                    <div>
                      {next && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveChapterId(next.id);
                            window.scrollTo({ top: 320, behavior: "smooth" });
                          }}
                          className="text-left px-4 py-2.5 rounded-lg border border-[#E2DCD0] hover:bg-[#FBF9F5] transition-colors cursor-pointer"
                        >
                          <span className="block text-xs text-[#78716C]">
                            اگلا باب
                          </span>
                          <span className="text-sm font-semibold text-[#14532D]">
                            باب {next.number}: {next.titleUrdu}
                          </span>
                        </button>
                      )}
                    </div>
                  </>
                );
              })()}
            </footer>
          </article>
        </div>
      </main>

      {/* Bottom Sticky Audio Player Bar */}
      <AudioPlayerBar
        track={currentTrack}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        playbackRate={PLAYBACK_RATES[playbackRateIndex]}
        onTogglePlay={handleTogglePlayBar}
        onSeek={handleSeek}
        onChangeRate={() =>
          setPlaybackRateIndex((i) => (i + 1) % PLAYBACK_RATES.length)
        }
        onClose={() => {
          if (audioRef.current) {
            audioRef.current.pause();
          }
          setIsPlaying(false);
          setCurrentTrack(null);
        }}
      />

      {/* Roman Urdu -> Urdu Script Converter & Add Chapter Modal */}
      <AddChapterModal
        isOpen={isAddModalOpen}
        nextChapterNumber={chapters.length + 1}
        onClose={() => setIsAddModalOpen(false)}
        onAddChapter={handleAddCustomChapter}
      />
    </div>
  );
}
