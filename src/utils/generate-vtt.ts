import fs from 'fs';

export async function generateVTT(filePath: string) {
  const lines: string[] = ["WEBVTT\n"];

  const frameDuration = 5; //сек
  const width = 160;
  const height = 90;
  const cols = 10;

  let time = 0;

  for (let i = 0; i < 100; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;

    const x = col * width;
    const y = row * height;

    lines.push(
      `${formatTime(time)} --> ${formatTime(time + frameDuration)}`
    );

    lines.push(
      `thumbnails.jpg#xywh=${x},${y},${width},${height}\n`
    );

    time += frameDuration;
  }

  await fs.promises.writeFile(filePath, lines.join("\n"));
}

function formatTime(sec: number) {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = (sec % 60).toFixed(3).padStart(6, "0");

  return `${h}:${m}:${s}`;
}