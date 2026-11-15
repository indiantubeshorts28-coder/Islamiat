import type { Chapter, ChapterSection } from "../types";

export function buildSectionSpeechText(section: ChapterSection): string {
  const parts: string[] = [section.titleUrdu];
  if (section.metaUrdu) {
    parts.push(section.metaUrdu);
  }
  parts.push(...section.paragraphs);
  if (section.bulletPoints && section.bulletPoints.length > 0) {
    parts.push(...section.bulletPoints);
  }
  return parts.join("۔\n");
}

export function buildChapterSpeechText(chapter: Chapter): string {
  const header = `باب نمبر ${chapter.number}: ${chapter.titleUrdu}۔ ${chapter.subtitleUrdu}۔`;
  const body = chapter.sections.map(buildSectionSpeechText).join("\n\n");
  return `${header}\n\n${body}`;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function triggerFileDownload(url: string, filename: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
