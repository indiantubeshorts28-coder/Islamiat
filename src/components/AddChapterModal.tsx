import { useState } from "react";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import type { Chapter } from "../types";

interface AddChapterModalProps {
  isOpen: boolean;
  nextChapterNumber: number;
  onClose: () => void;
  onAddChapter: (chapter: Chapter) => void;
}

export function AddChapterModal({
  isOpen,
  nextChapterNumber,
  onClose,
  onAddChapter,
}: AddChapterModalProps) {
  const [rawTitle, setRawTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [categoryUrdu, setCategoryUrdu] = useState("اضافی باب");
  const [convertedTitle, setConvertedTitle] = useState("");
  const [convertedSubtitle, setConvertedSubtitle] = useState("");
  const [convertedParagraphs, setConvertedParagraphs] = useState<string[]>([]);
  const [step, setStep] = useState<"input" | "preview">("input");
  const [isConverting, setIsConverting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConvert = async () => {
    if (!rawText.trim()) {
      setErrorMsg("براہِ کرم رومن اردو یا اصل متن درج کریں۔");
      return;
    }

    setIsConverting(true);
    setErrorMsg(null);

    try {
      const response = await fetch("/api/convert-urdu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: rawTitle.trim(), rawText: rawText.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "تبدیلی ناکام رہی۔");
      }

      setConvertedTitle(data.urduTitle || rawTitle || `باب نمبر ${nextChapterNumber}`);
      setConvertedSubtitle(data.urduSubtitle || "اردو مطالعہ و آڈیو باب");
      setConvertedParagraphs(
        Array.isArray(data.paragraphs) && data.paragraphs.length > 0
          ? data.paragraphs
          : [rawText.trim()]
      );
      setStep("preview");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "اردو میں تبدیلی کے دوران خرابی آئی۔"
      );
    } finally {
      setIsConverting(false);
    }
  };

  const handleSave = () => {
    if (!convertedTitle.trim() || convertedParagraphs.length === 0) return;
    const totalWords = convertedParagraphs.join(" ").split(/\s+/).length;
    const estimatedMinutes = Math.max(1, Math.ceil(totalWords / 140));
    const slug = `custom-${Date.now()}`;

    const newChapter: Chapter = {
      id: slug,
      number: nextChapterNumber,
      titleUrdu: convertedTitle.trim(),
      subtitleUrdu: convertedSubtitle.trim() || "اردو مطالعہ",
      categoryUrdu: categoryUrdu.trim() || "اضافی باب",
      estimatedMinutes,
      isCustom: true,
      sections: [
        {
          id: `${slug}-sec-1`,
          titleUrdu: convertedTitle.trim(),
          paragraphs: convertedParagraphs.filter((p) => p.trim().length > 0),
        },
      ],
    };

    onAddChapter(newChapter);
    setRawTitle("");
    setRawText("");
    setConvertedTitle("");
    setConvertedSubtitle("");
    setConvertedParagraphs([]);
    setStep("input");
    setErrorMsg(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-chapter-title"
    >
      <div className="w-full max-w-2xl bg-[#FBF9F5] border border-[#D6CEBE] rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 bg-[#F3EFE6] border-b border-[#E2DCD0]">
          <div>
            <h2
              id="add-chapter-title"
              className="font-urdu-display text-xl font-bold text-[#1C1917]"
            >
              نیا باب شامل کریں (پہلے اردو میں تبدیلی)
            </h2>
            <p className="text-xs text-[#57534E] mt-0.5">
              رومن اردو نوٹس درج کریں، اردو رسم الخط میں تبدیل کریں اور باب کے طور پر محفوظ کریں۔
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[#57534E] hover:text-[#1C1917] hover:bg-[#EBE6DF] transition-colors"
            aria-label="بند کریں"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-[#9A3412]/10 border border-[#9A3412]/25 text-sm text-[#9A3412]">
              {errorMsg}
            </div>
          )}

          {step === "input" ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#292524] mb-1.5">
                    باب کا عنوان (اختیاری)
                  </label>
                  <input
                    type="text"
                    value={rawTitle}
                    onChange={(e) => setRawTitle(e.target.value)}
                    placeholder="مثلاً: 8. Sulah Hudaibiya"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D6CEBE] rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#292524] mb-1.5">
                    زمرہ (Category)
                  </label>
                  <input
                    type="text"
                    value={categoryUrdu}
                    onChange={(e) => setCategoryUrdu(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D6CEBE] rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#292524] mb-1.5">
                  رومن اردو یا خام متن درج کریں
                </label>
                <textarea
                  rows={8}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="مثال: 6 Hijri mein Nabi (SAW) sahaba ke saath Umrah ke liye nikle..."
                  className="w-full px-3.5 py-3 text-sm bg-white border border-[#D6CEBE] rounded-lg focus:outline-none focus:border-[#14532D] leading-relaxed"
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#292524] mb-1.5">
                    تبدیل شدہ اردو عنوان
                  </label>
                  <input
                    type="text"
                    value={convertedTitle}
                    onChange={(e) => setConvertedTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-base font-semibold bg-white border border-[#D6CEBE] rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#292524] mb-1.5">
                    مختصر تعارف / ذیلی عنوان
                  </label>
                  <input
                    type="text"
                    value={convertedSubtitle}
                    onChange={(e) => setConvertedSubtitle(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-[#D6CEBE] rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#292524] mb-1.5">
                    تبدیل شدہ اردو تحریر (آپ اس میں ترمیم بھی کر سکتے ہیں)
                  </label>
                  <textarea
                    rows={9}
                    value={convertedParagraphs.join("\n\n")}
                    onChange={(e) =>
                      setConvertedParagraphs(
                        e.target.value
                          .split(/\n{2,}/)
                          .map((p) => p.trim())
                          .filter(Boolean)
                      )
                    }
                    className="w-full px-4 py-3 text-base font-urdu-body bg-white border border-[#D6CEBE] rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 bg-[#F3EFE6] border-t border-[#E2DCD0] flex items-center justify-between gap-3">
          {step === "preview" ? (
            <button
              type="button"
              onClick={() => setStep("input")}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-[#292524] hover:bg-[#EBE6DF] rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4 rotate-180" />
              <span>واپس متن میں ترمیم کریں</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[#57534E] hover:text-[#1C1917] rounded-lg transition-colors"
            >
              منسوخ کریں
            </button>
          )}

          {step === "input" ? (
            <button
              type="button"
              onClick={handleConvert}
              disabled={isConverting}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#14532D] hover:bg-[#166534] disabled:opacity-60 rounded-lg transition-colors"
            >
              {isConverting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{isConverting ? "اردو میں تبدیل ہو رہا ہے..." : "اردو متن میں تبدیل کریں"}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>باب شامل کریں</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
