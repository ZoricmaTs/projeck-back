import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from 'path';

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

    let contentType = "application/octet-stream";

    if (key.endsWith(".m3u8")) {
      contentType = "application/vnd.apple.mpegurl";
    } else if (key.endsWith(".ts")) {
      contentType = "video/mp2t";
    }

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: fileStream,
      ContentType: contentType
    });

    await s3Client.send(command);
  },


  async uploadHLSFolder(localDir: string, remotePrefix: string) {
    const files = await fs.promises.readdir(localDir);

    for (const file of files) {
      const fullPath = path.join(localDir, file);

      const stat = await fs.promises.stat(fullPath);
      if (stat.isDirectory()) continue;

      await this.uploadVideo(fullPath, `${remotePrefix}/${file}`);
    }
  }
};
