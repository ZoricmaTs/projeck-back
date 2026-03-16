import express from "express";
import { videoController } from '../controllers/video.ts';

const routerVideo = express.Router();

routerVideo.post("/upload-url", videoController.createUploadUrl);
routerVideo.post("/:videoId/uploaded", videoController.markUploaded);
routerVideo.get("/:videoId/is-processed", videoController.isProcessed);
routerVideo.get("/:videoId", videoController.getVideo);

export default routerVideo;