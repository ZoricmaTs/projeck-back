import { PrismaClient, ValidationStatus, type Video } from "@prisma/client";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from '@aws-sdk/client-s3';
import {s3Client, videoService} from '../services/r2Client.js';
import type {Request, Response} from 'express';
import path from "path";
import type {FfprobeData, FfprobeStream} from 'fluent-ffmpeg';
import ffmpeg from "fluent-ffmpeg"
import fs from 'fs';
import {ApiError} from '../errors/api-error.js';
import {generateVTT} from '../utils/generate-vtt.js';

const prisma = new PrismaClient();

let isProcessing = false;

export async function maybeStartProcessing() {
  if (isProcessing) {
    return;
  }

  isProcessing = true;

  try {
    while (true) {
      const video = await prisma.video.findFirst({
        where: { validationStatus: ValidationStatus.QUEUED },
        orderBy: { createdAt: "asc" }
      });

      if (!video) {
        break;
      }

      await prisma.video.update({
        where: { id: video.id },
        data: { validationStatus: ValidationStatus.PROCESSING }
      });

      await processVideo(video);
    }
  } catch (err) {
    console.error(err);
  } finally {
    isProcessing = false;
  }
}

export async function processVideo(video: Video | null) {
  if (!video) {
    return;
  }

  const localPath = path.join("uploads", video.url);
  const hlsDir = path.join("uploads", video.id);

  try {
    // Скачиваем видео с R2
    await videoService.downloadVideo(video.url, localPath);

    const metadata: FfprobeData = await new Promise((res, rej) =>
      ffmpeg.ffprobe(localPath, (err, data) => err ? rej(err) : res(data))
    );

    // Валидация
    const vStream: FfprobeStream | undefined = metadata.streams.find(s => s.codec_type === "video");

    if (!vStream || !["h264", "vp8", "vp9"].includes(vStream.codec_name!) || metadata.format.duration! > 600) {
      await prisma.video.update({
        where: { id: video.id },
        data: { validationStatus: ValidationStatus.INVALID }
      });

      await fs.promises.unlink(localPath);

      return;
    }

    await prisma.video.update({
      where: { id: video.id },
      data: {
        validationStatus: ValidationStatus.PROCESSING,
        codec: vStream.codec_name!,
        duration: Math.floor(metadata.format.duration!),
        width: vStream.width!,
        height: vStream.height!,
      }
    });

    const qualities = [
      { name: "720p", width: 1280, height: 720, bitrate: "2500k" },
      { name: "480p", width: 854, height: 480, bitrate: "1000k" }
    ];


    //папка под HLS
    const hlsFolder = path.join("uploads", `hls_${video.id}`);

    if (!fs.existsSync(hlsFolder)) {
      fs.mkdirSync(hlsFolder);
    }

    // ffmpeg кодирование
    for (const q of qualities) {
      const segmentPattern = path.join(hlsFolder, `${q.name}_%03d.ts`);
      const playlistPath = path.join(hlsFolder, `${q.name}.m3u8`);

      await new Promise<void>((res, rej) => {
        ffmpeg(localPath)
          .outputOptions([
            "-preset", "veryfast",
            "-g", "48",
            "-sc_threshold", "0",
            "-vf", `scale=${q.width}:${q.height}`,
            "-c:v", "libx264",
            "-b:v", q.bitrate,
            "-c:a", "aac",
            "-b:a", "128k",
            "-f", "hls",
            "-hls_time", "4",
            "-hls_playlist_type", "vod",
            "-hls_segment_filename", segmentPattern
          ])
          .output(playlistPath)
          .on("end", () => res())
          .on("error", (err) => rej(err))
          .run();
      });
    }

    const masterPlaylist = qualities.map(q =>
      `#EXT-X-STREAM-INF:BANDWIDTH=${q.bitrate.replace("k","000")},RESOLUTION=${q.width}x${q.height}\n${q.name}.m3u8`
    ).join("\n");

    await fs.promises.writeFile(path.join(hlsFolder, "master.m3u8"), `#EXTM3U\n${masterPlaylist}`);

    // Загружаем на R2
    await videoService.uploadHLSFolder(hlsFolder, `hls/${video.id}`);

    await prisma.video.update({
      where: { id: video.id },
      data: {
        hlsUrl: `hls/${video.id}/master.m3u8`
      }
    });

    try {
      const hlsInput = path.join(hlsFolder, "720p.m3u8");

      const thumbs = await videoController.generateThumbnails(hlsInput, video.id);
      await prisma.video.update({
        where: { id: video.id },
        data: {
          thumbnailSprite: thumbs.spriteKey,
          thumbnailVtt: thumbs.vttKey,
        }
      });
    } catch (err) {
      console.error("Thumbnail generation failed", err);
    }
  } catch (err) {
    console.error(err)

    await prisma.video.update({
      where: { id: video.id },
      data: { validationStatus: ValidationStatus.INVALID }
    })
  } finally {
    if (fs.existsSync(localPath)) {
      await fs.promises.unlink(localPath);
    }

    if (fs.existsSync(hlsDir)) {
      await fs.promises.rm(hlsDir, { recursive: true, force: true });
    }
  }

  await prisma.video.update({
    where: { id: video.id },
    data: {
      validationStatus: ValidationStatus.READY
    }
  });
}

export const videoController = {
  createUploadUrl: async (req: Request, res: Response) => {
    const { filename, title } = req.body;

    const video = await prisma.video.create({
      data: { title, url: filename }
    });

    const command = new PutObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: filename });
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 });

    return res.json({ videoId: video.id, uploadUrl });
  },
  markUploaded: async (req: Request, res: Response) => {
    const { videoId } = req.params;

    await prisma.video.update({
      where: { id: videoId as string },
      data: { validationStatus: ValidationStatus.QUEUED }
    });

    await maybeStartProcessing();

    res.json({ message: "Video queued for processing" })
  },

  isProcessed: async  (req: Request, res: Response) => {
    const { videoId } = req.params;

    const video = await prisma.video.findUnique({ where: { id: videoId as string } });

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    return res.json({ status: video.validationStatus });
  },

  getVideo: async (req: Request, res: Response) => {
    const { videoId } = req.params;

    const video = await prisma.video.findFirst({
      where: {
        id: videoId as string,
        validationStatus: ValidationStatus.READY
      }
    });

    if (!video) {
      throw ApiError.NotFound("Video not found");
    }

    return res.json({
      id: video.id,
      title: video.title,
      description: video.description,
      hlsUrl: `https://pub-${process.env.R2_PUBLIC}.r2.dev/${video.hlsUrl}`,
      duration: video.duration,
      width: video.width,
      height: video.height,
      codec: video.codec,
      thumbnailVtt: `https://pub-${process.env.R2_PUBLIC}.r2.dev/${video.thumbnailVtt}`,
      thumbnailSprite: `https://pub-${process.env.R2_PUBLIC}.r2.dev/${video.thumbnailSprite}`,
    });
  },
  generateThumbnails: async (inputPath: string, videoId: string) => {
    const outDir = path.join("uploads", "thumbnails", videoId);
    await fs.promises.mkdir(outDir, { recursive: true });

    const spritePath = path.join(outDir, "thumbnails.jpg");
    const vttPath = path.join(outDir, "thumbnails.vtt");

    await new Promise<void>((res, rej) => {
      ffmpeg(path.resolve(inputPath))
        .inputOptions([
          "-ss", "00:00:02",
          "-protocol_whitelist", "file,http,https,tcp,tls",
          "-allowed_extensions", "ALL",
          "-analyzeduration", "100M",
          "-probesize", "100M"
        ])
        .outputOptions([
          "-vf", "fps=1/2,scale=160:90,tile=5x5",
          "-frames:v", "25",
          "-vsync", "vfr"
        ])
        .output(spritePath)
        .on("end", () => res())
        .on("error", (err) => rej(err))
        .run();
    });

    await generateVTT(vttPath);
    await videoService.uploadFolder(outDir, `hls/${videoId}/thumbnails`);
    await fs.promises.rm(outDir, { recursive: true, force: true });

    return {
      spriteKey: `hls/${videoId}/thumbnails/thumbnails.jpg`,
      vttKey: `hls/${videoId}/thumbnails/thumbnails.vtt`
    };
  }
}
