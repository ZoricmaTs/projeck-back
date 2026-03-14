import { PrismaClient, ValidationStatus } from "@prisma/client";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {s3Client, videoService} from '../services/r2Client.js';
import type {Request, Response} from 'express';
import path from "path";
import type {FfprobeData, FfprobeStream} from 'fluent-ffmpeg';
import ffmpeg from "fluent-ffmpeg"
import fs from 'fs';

const prisma = new PrismaClient()

let isProcessing = false;

export async function maybeStartProcessing() {
  if (isProcessing) {
    return;
  }

  isProcessing = true;

  const video = await prisma.video.findFirst({
    where: { validationStatus: ValidationStatus.QUEUED },
    orderBy: { createdAt: "asc" }
  });

  try {
    if (!video) {
      isProcessing = false;
      return;
    }

    const localPath = path.join("uploads", video.url);
    // Скачиваем видео с R2
    await videoService.downloadVideo(video.url, localPath);

    const metadata: FfprobeData = await new Promise((res, rej) =>
      ffmpeg.ffprobe(localPath, (err, data) => (err ? rej(err) : res(data)))
    );

    console.log("Video metadata", metadata);
    // Валидация
    const vStream: FfprobeStream | undefined = metadata.streams.find(s => s.codec_type === "video");
    if (!vStream || !["h264","vp8","vp9"].includes(vStream.codec_name!) || metadata.format.duration! > 600) {
      await prisma.video.update({
        where: { id: video.id },
        data: { validationStatus: ValidationStatus.INVALID }
      });

      fs.unlinkSync(localPath);
      isProcessing = false;

      return;
    }

    // Обновляем метаданные видео
    await prisma.video.update({
      where: { id: video.id },
      data: {
        validationStatus: ValidationStatus.VALID,
        codec: vStream.codec_name!,
        duration: Math.floor(metadata.format.duration!),
        width: vStream.width!,
        height: vStream.height!,
        processedVideos: [],
      }
    });

    // Создаём версии видео
    const qualities = [
      { suffix: "720p", width: 1280, height: 720 },
      { suffix: "480p", width: 854, height: 480 }
    ];

    const processedIds: string[] = [];

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

      // Удаляем локальный файл
      fs.unlinkSync(outPath);

      const processedVideo = await prisma.processedVideo.create({
        data: {
          videoId: video.id,
          url: processedUrl,
          width: q.width,
          height: q.height,
          duration: Math.floor(metadata.format.duration!),
          codec: vStream.codec_name!,
        }
      });

      processedIds.push(processedVideo.id);
    }

    // Удаляем исходный локальный файл
    fs.unlinkSync(localPath);

    // Обновляем запись видео с массивом processed URLs
    await prisma.video.update({
      where: { id: video.id },
      data: {
        processedVideos: processedIds,
        validationStatus: ValidationStatus.READY,
      }
    });

  } catch (err) {
    console.error("Error processing video:", err);
    await prisma.video.update({
      where: { id: video!.id },
      data: { validationStatus: ValidationStatus.INVALID }
    });
  } finally {
    isProcessing = false;
  }
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
      data: {
        validationStatus: ValidationStatus.QUEUED
      }
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

    return res.json({ processed: video.validationStatus === ValidationStatus.READY });
  }
}
