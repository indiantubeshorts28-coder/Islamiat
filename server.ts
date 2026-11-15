import "dotenv/config";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import express from "express";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_CACHE_DIR = path.join(__dirname, ".audio-cache");
const PORT = 3000;

fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });

function getAiClient(apiVersion = "v1beta"): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion,
    httpOptions: {
      apiVersion,
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function splitTextIntoTtsChunks(text: string, maxChars = 950): string[] {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const paragraphs = normalized
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current.trim()) {
      chunks.push(current.trim());
      current = "";
    }
  };

  for (const para of paragraphs) {
    if ((current ? current.length + 1 : 0) + para.length <= maxChars) {
      current = current ? `${current}\n${para}` : para;
      continue;
    }

    if (para.length <= maxChars) {
      pushCurrent();
      current = para;
      continue;
    }

    // Split long paragraph by Urdu/English sentence boundaries (۔, ., ?, !, ؛)
    const sentences = para.split(/(?<=[۔.؟?!؛])\s+/);
    for (const sentence of sentences) {
      if ((current ? current.length + 1 : 0) + sentence.length <= maxChars) {
        current = current ? `${current} ${sentence}` : sentence;
      } else if (sentence.length <= maxChars) {
        pushCurrent();
        current = sentence;
      } else {
        // Hard word-boundary split for unusually long unbroken sentences
        pushCurrent();
        const words = sentence.split(/\s+/);
        for (const word of words) {
          if ((current ? current.length + 1 : 0) + word.length <= maxChars) {
            current = current ? `${current} ${word}` : word;
          } else {
            pushCurrent();
            current = word;
          }
        }
      }
    }
  }

  pushCurrent();
  return chunks;
}

function extractPcmFromWav(wavBuffer: Buffer): {
  header44: Buffer;
  pcm: Buffer;
} {
  if (wavBuffer.length <= 44 || wavBuffer.subarray(0, 4).toString("ascii") !== "RIFF") {
    const fallbackHeader = Buffer.alloc(44);
    fallbackHeader.write("RIFF", 0);
    fallbackHeader.writeUInt32LE(36 + wavBuffer.length, 4);
    fallbackHeader.write("WAVE", 8);
    fallbackHeader.write("fmt ", 12);
    fallbackHeader.writeUInt32LE(16, 16);
    fallbackHeader.writeUInt16LE(1, 20);
    fallbackHeader.writeUInt16LE(1, 22);
    fallbackHeader.writeUInt32LE(24000, 24);
    fallbackHeader.writeUInt32LE(48000, 28);
    fallbackHeader.writeUInt16LE(2, 32);
    fallbackHeader.writeUInt16LE(16, 34);
    fallbackHeader.write("data", 36);
    fallbackHeader.writeUInt32LE(wavBuffer.length, 40);
    return { header44: fallbackHeader, pcm: wavBuffer };
  }

  // Walk RIFF subchunks starting at offset 12 to extract exact 'data' PCM without C2PA/trailing metadata
  let offset = 12;
  let dataOffset = 44;
  let dataSize = wavBuffer.length - 44;

  while (offset + 8 <= wavBuffer.length) {
    const chunkId = wavBuffer.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      dataOffset = offset + 8;
      dataSize = Math.min(chunkSize, wavBuffer.length - dataOffset);
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  return {
    header44: Buffer.from(wavBuffer.subarray(0, 44)),
    pcm: wavBuffer.subarray(dataOffset, dataOffset + dataSize),
  };
}

function mergeWavBuffers(wavBuffers: Buffer[]): {
  wavBuffer: Buffer;
  durationSec: number;
} {
  if (wavBuffers.length === 0) {
    throw new Error("No audio buffers returned.");
  }

  const parsed = wavBuffers.map(extractPcmFromWav);
  const header = Buffer.from(parsed[0].header44);
  const pcmParts = parsed.map((p) => p.pcm);
  const totalPcmBytes = pcmParts.reduce((sum, p) => sum + p.length, 0);

  header.write("data", 36);
  header.writeUInt32LE(36 + totalPcmBytes, 4);
  header.writeUInt32LE(totalPcmBytes, 40);

  const byteRate = header.readUInt32LE(28) || 48000;
  const durationSec = Math.round(totalPcmBytes / byteRate);

  return {
    wavBuffer: Buffer.concat([header, ...pcmParts]),
    durationSec,
  };
}

async function getAudioDurationSeconds(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-hide_banner",
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const parsed = parseFloat(stdout.trim());
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
  } catch {
    return 0;
  }
}

async function transcodeWavToMp3(wavPath: string, mp3Path: string): Promise<void> {
  const tmpMp3 = `${mp3Path}.tmp.mp3`;
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    wavPath,
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "64k",
    "-ar",
    "24000",
    "-ac",
    "1",
    tmpMp3,
  ]);
  fs.renameSync(tmpMp3, mp3Path);
}

function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; message?: string };
  if (e.status === 429) return true;
  const msg = e.message || String(err);
  return msg.includes("RESOURCE_EXHAUSTED") || msg.includes('"code":429');
}

async function callGeminiTtsModel(
  model: string,
  textChunk: string,
  voiceName: string
): Promise<Buffer> {
  const ai = getAiClient("v1beta");
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: textChunk,
            speechMetadata: {
              style:
                "Clear, calm, respectful Urdu scholarly narrator reading educational Islamic chapters with accurate Arabic and Urdu pronunciation.",
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  const base64Audio =
    response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error("Model returned an empty audio payload.");
  }
  return Buffer.from(base64Audio, "base64");
}

async function generateChunkSmart(
  textChunk: string,
  voiceName: string
): Promise<Buffer> {
  try {
    return await callGeminiTtsModel(
      "gemini-3.8-flash-lite-tts",
      textChunk,
      voiceName
    );
  } catch (err) {
    if (isQuotaExceededError(err)) {
      // Fallback once to secondary TTS model in case per-model free tier quota differs
      return await callGeminiTtsModel(
        "gemini-3.8-flash-tts",
        textChunk,
        voiceName
      );
    }
    throw err;
  }
}

const inFlightJobs = new Map<string, Promise<{ sizeBytes: number; durationSec: number }>>();

async function ensureAudioFile(
  fileKey: string,
  text: string,
  voiceName: string
): Promise<{ sizeBytes: number; durationSec: number; cached: boolean }> {
  const mp3Path = path.join(AUDIO_CACHE_DIR, `${fileKey}.mp3`);
  const wavPath = path.join(AUDIO_CACHE_DIR, `${fileKey}.wav`);

  if (fs.existsSync(mp3Path)) {
    const stat = fs.statSync(mp3Path);
    const durationSec = await getAudioDurationSeconds(mp3Path);
    return {
      sizeBytes: stat.size,
      durationSec,
      cached: true,
    };
  }

  const existingJob = inFlightJobs.get(fileKey);
  if (existingJob) {
    const res = await existingJob;
    return { ...res, cached: true };
  }

  const job = (async () => {
    // If an earlier WAV file already exists on disk, transcode it locally without spending TTS quota
    if (fs.existsSync(wavPath)) {
      await transcodeWavToMp3(wavPath, mp3Path);
      const stat = fs.statSync(mp3Path);
      const durationSec = await getAudioDurationSeconds(mp3Path);
      return { sizeBytes: stat.size, durationSec };
    }

    const chunks = splitTextIntoTtsChunks(text, 4800);
    if (chunks.length === 0) {
      throw new Error("No text provided for audio generation.");
    }

    const buffers: Buffer[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const buf = await generateChunkSmart(chunks[i], voiceName);
      buffers.push(buf);
    }

    const { wavBuffer, durationSec } = mergeWavBuffers(buffers);
    const tmpWav = `${wavPath}.tmp.wav`;
    fs.writeFileSync(tmpWav, wavBuffer);
    try {
      await transcodeWavToMp3(tmpWav, mp3Path);
    } finally {
      if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav);
    }

    const stat = fs.statSync(mp3Path);
    return {
      sizeBytes: stat.size,
      durationSec,
    };
  })();

  inFlightJobs.set(fileKey, job);
  try {
    const result = await job;
    return { ...result, cached: false };
  } finally {
    inFlightJobs.delete(fileKey);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // Generate or retrieve cached Urdu TTS WAV audio
  app.post("/api/tts", async (req, res) => {
    try {
      const { itemId, text, voiceName = "Kore" } = req.body as {
        itemId?: string;
        text?: string;
        voiceName?: string;
      };

      if (!text || typeof text !== "string" || !text.trim()) {
        res.status(400).json({ error: "آڈیو بنانے کے لیے اردو متن موجود نہیں ہے۔" });
        return;
      }

      const allowedVoices = new Set(["Kore", "Charon", "Zephyr", "Puck", "Fenrir"]);
      const safeVoice = allowedVoices.has(voiceName) ? voiceName : "Kore";
      const safeId = (itemId || "chapter").replace(/[^a-zA-Z0-9_-]/g, "");
      const textHash = crypto
        .createHash("sha256")
        .update(`${safeVoice}:${text.trim()}`)
        .digest("hex")
        .slice(0, 12);
      const fileKey = `${safeId}_${safeVoice}_${textHash}`;

      const info = await ensureAudioFile(fileKey, text, safeVoice);

      res.json({
        fileKey,
        audioUrl: `/api/audio/${fileKey}`,
        downloadUrl: `/api/audio/${fileKey}?download=1&filename=${encodeURIComponent(
          `${safeId}.mp3`
        )}`,
        sizeBytes: info.sizeBytes,
        durationSec: info.durationSec,
        cached: info.cached,
      });
    } catch (err: unknown) {
      if (isQuotaExceededError(err)) {
        res.status(429).json({
          errorCode: "QUOTA_EXCEEDED",
          error:
            "Gemini فری ٹائر کی آڈیو لِمٹ (RPM/RPD) پوری ہو چکی ہے۔ آپ نیچے 'براؤزر کی آواز میں سنیں' استعمال کر سکتے ہیں یا Settings > Secrets میں بلنگ فعال API Key منتخب کر کے آڈیو ڈاؤن لوڈ کر سکتے ہیں۔",
        });
        return;
      }
      console.error("TTS generation error:", err);
      const message =
        err instanceof Error ? err.message : "آڈیو تیار کرنے میں خرابی پیش آئی۔";
      res.status(500).json({ error: message });
    }
  });

  // Stream or download MP3 file with capped HTTP Range support for smooth seeking
  app.get("/api/audio/:fileKey", (req, res) => {
    const safeKey = req.params.fileKey.replace(/[^a-zA-Z0-9_-]/g, "");
    const mp3Path = path.join(AUDIO_CACHE_DIR, `${safeKey}.mp3`);

    if (!fs.existsSync(mp3Path)) {
      res.status(404).json({ error: "Audio file not found." });
      return;
    }

    const stat = fs.statSync(mp3Path);
    const fileSize = stat.size;
    const isDownload = req.query.download === "1";
    const downloadName =
      typeof req.query.filename === "string" && req.query.filename.trim()
        ? req.query.filename.replace(/[^a-zA-Z0-9._-]/g, "_")
        : `${safeKey}.mp3`;

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=86400");

    if (isDownload) {
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${downloadName}"`
      );
      res.setHeader("Content-Length", fileSize);
      fs.createReadStream(mp3Path).pipe(res);
      return;
    }

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = Math.max(0, parseInt(parts[0], 10) || 0);
      const maxChunk = 2 * 1024 * 1024; // Cap open-ended ranges at 2MB for proxy safety
      const requestedEnd = parts[1] ? parseInt(parts[1], 10) : Math.min(start + maxChunk - 1, fileSize - 1);
      const end = Math.min(requestedEnd, fileSize - 1);

      if (start >= fileSize || start > end) {
        res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
        return;
      }

      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      res.setHeader("Content-Length", chunkSize);
      fs.createReadStream(mp3Path, { start, end }).pipe(res);
    } else {
      res.setHeader("Content-Length", fileSize);
      fs.createReadStream(mp3Path).pipe(res);
    }
  });

  // Convert Roman Urdu / English / Raw notes into proper Urdu script before adding a chapter
  app.post("/api/convert-urdu", async (req, res) => {
    try {
      const { title, rawText } = req.body as {
        title?: string;
        rawText?: string;
      };

      if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
        res.status(400).json({ error: "تبدیل کرنے کے لیے متن درج کریں۔" });
        return;
      }

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: `Convert the following Roman Urdu or raw Islamic study notes into clean, natural, well-punctuated standard Urdu script (اردو تحریر). Preserve every historical fact, date, number, Quranic reference, and name accurately without adding or removing facts. Split the converted text into clear readable paragraphs.

Title (if provided): ${title || "(Auto-generate an appropriate Urdu title)"}

Text:
${rawText}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              urduTitle: {
                type: Type.STRING,
                description: "Clean Urdu chapter title.",
              },
              urduSubtitle: {
                type: Type.STRING,
                description: "Short 1-line Urdu subtitle or topic summary.",
              },
              paragraphs: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Converted Urdu paragraphs in proper Nastaliq/Urdu script.",
              },
            },
            required: ["urduTitle", "urduSubtitle", "paragraphs"],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? "{}").trim());
      res.json(parsed);
    } catch (err: unknown) {
      console.error("Urdu conversion error:", err);
      const message =
        err instanceof Error ? err.message : "اردو میں تبدیلی کے دوران خرابی پیش آئی۔";
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV === "production") {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
