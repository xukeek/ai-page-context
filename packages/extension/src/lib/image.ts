import type { AnnotationStroke } from '@ai-page-context/protocol';

export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

export async function cropDataUrl(
  dataUrl: string,
  rect: { x: number; y: number; width: number; height: number },
  dpr = window.devicePixelRatio || 1,
): Promise<string> {
  const img = await loadImage(dataUrl);
  const sx = Math.max(0, Math.round(rect.x * dpr));
  const sy = Math.max(0, Math.round(rect.y * dpr));
  const sw = Math.min(img.width - sx, Math.round(rect.width * dpr));
  const sh = Math.min(img.height - sy, Math.round(rect.height * dpr));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, sw);
  canvas.height = Math.max(1, sh);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unsupported');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.toDataURL('image/png');
}

export async function compressDataUrl(dataUrl: string, maxEdge = 1600): Promise<string> {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  if (scale >= 1) return dataUrl;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: AnnotationStroke[],
): void {
  for (const stroke of annotations) {
    ctx.save();
    if (stroke.type === 'pen') {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      stroke.points.forEach((pt, i) => {
        const x = pt[0] ?? 0;
        const y = pt[1] ?? 0;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    } else if (stroke.type === 'arrow') {
      const x1 = stroke.from[0] ?? 0;
      const y1 = stroke.from[1] ?? 0;
      const x2 = stroke.to[0] ?? 0;
      const y2 = stroke.to[1] ?? 0;
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = 12;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    } else if (stroke.type === 'rect') {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = 3;
      ctx.strokeRect(stroke.x, stroke.y, stroke.w, stroke.h);
      ctx.fillStyle = stroke.color + '22';
      ctx.fillRect(stroke.x, stroke.y, stroke.w, stroke.h);
    } else if (stroke.type === 'text') {
      ctx.fillStyle = stroke.color;
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(stroke.text, stroke.x, stroke.y);
    }
    ctx.restore();
  }
}

export async function composeAnnotated(
  screenshotDataUrl: string,
  annotations: AnnotationStroke[],
): Promise<string> {
  const img = await loadImage(screenshotDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return screenshotDataUrl;
  ctx.drawImage(img, 0, 0);
  // Annotations are stored in CSS pixel space relative to displayed image;
  // for MVP we assume annotation coords match image pixel coords after crop.
  drawAnnotations(ctx, annotations);
  return compressDataUrl(canvas.toDataURL('image/png'));
}
