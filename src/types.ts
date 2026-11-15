export type VoiceId = "Kore" | "Charon" | "Zephyr";

export interface VoiceOption {
  id: VoiceId;
  labelUrdu: string;
  descriptionUrdu: string;
}

export interface ChapterSection {
  id: string;
  titleUrdu: string;
  metaUrdu?: string;
  paragraphs: string[];
  bulletPoints?: string[];
}

export interface Chapter {
  id: string;
  number: number;
  titleUrdu: string;
  subtitleUrdu: string;
  categoryUrdu: string;
  estimatedMinutes: number;
  sections: ChapterSection[];
  hasComparisonTable?: boolean;
  isCustom?: boolean;
}

export interface GhazwaComparisonRow {
  ghazwa: string;
  year: string;
  muslims: string;
  enemy: string;
  outcome: string;
  martyrs: string;
}

export interface AudioTrackInfo {
  itemId: string;
  titleUrdu: string;
  subtitleUrdu: string;
  audioUrl: string;
  downloadUrl: string;
  sizeBytes: number;
  durationSec: number;
  voiceName: VoiceId;
}
