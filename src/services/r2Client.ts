import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";

export const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!
  }
});

export const videoService = {
  async downloadVideo(key: string, localPath: string) {
    const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key });
    const response = await s3Client.send(command);
    const stream = response.Body as NodeJS.ReadableStream;

    return new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(localPath);
      stream.pipe(file).on("close", resolve).on("error", reject);
    })
  },

  async uploadVideo(localPath: string, key: string) {
    const fileStream = fs.createReadStream(localPath);
    const command = new PutObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key, Body: fileStream });

    await s3Client.send(command);
  }
};
