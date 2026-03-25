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

  try {
    const localPath = path.join("uploads", video.url);
    // Скачиваем видео с R2
    await videoService.downloadVideo(video.url, localPath);

    const metadata: FfprobeData = await new Promise((res, rej) =>
      ffmpeg.ffprobe(localPath, (err, data) => err ? rej(err) : res(data))
    );

    // Валидация
    const vStream: FfprobeStream | undefined = metadata.streams.find(s => s.codec_type === "video");
    if (!vStream || !["h264","vp8","vp9"].includes(vStream.codec_name!) || metadata.format.duration! > 600) {
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
        processedVideos: {
          set: []
        }
      }
    });

    // Создаём версии видео
    const qualities = [
      { suffix: "720p", width: 1280, height: 720 },
      { suffix: "480p", width: 854, height: 480 }
    ];

    for (const q of qualities) {
      const outPath = path.join("uploads", `${video.id}_${q.suffix}.mp4`);
      const processedUrl = `processed/${video.id}_${q.suffix}.mp4`;

      // ffmpeg кодирование
      await new Promise<void>((res, rej) => {
        ffmpeg(localPath)
          .outputOptions(`-vf scale=${q.width}:${q.height}`)
          .output(outPath)
          .on("end", () => res())
          .on("error", (err) => rej(err))
          .run();
      });

      // Загружаем на R2
      await videoService.uploadVideo(outPath, processedUrl);

      if (fs.existsSync(outPath)) {
        // Удаляем локальный файл
        await fs.promises.unlink(outPath);
      }

      await prisma.processedVideo.create({
        data: {
          videoId: video.id,
          url: processedUrl,
          width: q.width,
          height: q.height,
          duration: metadata.format.duration!,
          codec: vStream.codec_name!,
        }
      });
    }

    // Удаляем исходный локальный файл
    await fs.promises.unlink(localPath);

    // Обновляем запись видео с массивом processed URLs
    await prisma.video.update({
      where: { id: video.id },
      data: {
        validationStatus: ValidationStatus.READY,
      }
    });
  } catch (err) {
    console.error(err)

    await prisma.video.update({
      where: { id: video.id },
      data: { validationStatus: ValidationStatus.INVALID }
    })
  }
}

export async function getVideoUrl(key: string) {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key
  });

  return await getSignedUrl(s3Client, command, {
    expiresIn: 3600
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
      },
      include: {
        processedVideos: true
      }
    });

    if (!video) {
      throw ApiError.NotFound("Video not found");
    }

    const resolvedUrls = await Promise.all(video.processedVideos.map(p => getVideoUrl(p.url)));

    const processedVideosWithUrls = video.processedVideos.map((v, i) => ({
      ...v,
      url: resolvedUrls[i]!
    }));

    return res.json({
      ...video,
      processedVideos: processedVideosWithUrls
    });
  }
}
