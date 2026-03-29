import { PrismaClient, ValidationStatus, type Video } from "@prisma/client";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {s3Client, videoService} from '../services/r2Client.js';
import type {Request, Response} from 'express';
import path from "path";
import type {FfprobeData, FfprobeStream} from 'fluent-ffmpeg';
import ffmpeg from "fluent-ffmpeg"
import fs from 'fs';
import {ApiError} from '../errors/api-error.js';

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

    fs.rmSync(hlsFolder, { recursive: true, force: true });
    await fs.promises.unlink(localPath);

    await prisma.video.update({
      where: { id: video.id },
      data: {
        validationStatus: ValidationStatus.READY,
        hlsUrl: `hls/${video.id}/master.m3u8`
      }
    });
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
}

// export async function getVideoUrl(key: string) {
//   const command = new GetObjectCommand({
//     Bucket: process.env.R2_BUCKET!,
//     Key: key
//   });
//
//   return await getSignedUrl(s3Client, command, {
//     expiresIn: 3600
//   });
// }

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
    });
  }
}
