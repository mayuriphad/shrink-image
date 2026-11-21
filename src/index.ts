export interface ShrinkImageOptions {
  /** Target maximum file size in megabytes (e.g., 0.5 for 500KB). */
  maxSizeMB?: number;
  /** Maximum allowable width or height in pixels. Aspect ratio is preserved. Default: 1920 */
  maxWidthOrHeight?: number;
  /** Compression quality between 0.1 and 1.0. Default: 0.8 */
  initialQuality?: number;
  /** Output image mime-type. Default: 'image/webp' */
  outputType?: 'image/webp' | 'image/jpeg' | 'image/png';
  /** Progress callback reporting percentage from 0 to 100 */
  onProgress?: (progress: number) => void;
}

export interface ScaledDimensions {
  width: number;
  height: number;
}

/**
 * Calculates scaled dimensions preserving the original aspect ratio.
 */
export function calculateDimensions(
  origWidth: number,
  origHeight: number,
  maxDimension: number
): ScaledDimensions {
  if (origWidth <= maxDimension && origHeight <= maxDimension) {
    return { width: Math.round(origWidth), height: Math.round(origHeight) };
  }

  const ratio = origWidth / origHeight;
  if (origWidth > origHeight) {
    const width = maxDimension;
    const height = Math.round(width / ratio);
    return { width, height };
  } else {
    const height = maxDimension;
    const width = Math.round(height * ratio);
    return { width, height };
  }
}

/**
 * Loads an image Blob/File into an HTMLImageElement.
 */
function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image file: ' + String(err)));
    };
    img.src = url;
  });
}

/**
 * Converts canvas to a Blob using Promise.
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas toBlob failed to produce output.'));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
}

/**
 * Compresses and resizes an image File or Blob client-side.
 *
 * @example
 * ```ts
 * const compressed = await shrinkImage(file, {
 *   maxSizeMB: 0.5,
 *   maxWidthOrHeight: 1200,
 *   outputType: 'image/webp'
 * });
 * ```
 */
export async function shrinkImage(
  file: File | Blob,
  options: ShrinkImageOptions = {}
): Promise<File> {
  const {
    maxSizeMB = 1,
    maxWidthOrHeight = 1920,
    initialQuality = 0.8,
    outputType = 'image/webp',
    onProgress,
  } = options;

  onProgress?.(10);

  // 1. Load image into memory
  const img = await loadImage(file);
  onProgress?.(30);

  // 2. Compute target dimensions
  const { width, height } = calculateDimensions(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    maxWidthOrHeight
  );

  // 3. Render into canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to obtain 2D canvas context.');
  }

  // Smooth scaling configuration
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  onProgress?.(60);

  const maxBytes = maxSizeMB * 1024 * 1024;
  let currentQuality = Math.min(1.0, Math.max(0.1, initialQuality));
  let blob = await canvasToBlob(canvas, outputType, currentQuality);

  // 4. Iteratively reduce quality if image still exceeds maxSizeMB
  let iterations = 0;
  while (blob.size > maxBytes && currentQuality > 0.2 && iterations < 5) {
    iterations++;
    currentQuality -= 0.15;
    blob = await canvasToBlob(canvas, outputType, currentQuality);
  }

  onProgress?.(90);

  // 5. Construct output File
  const originalName = file instanceof File ? file.name : 'image';
  const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
  const ext = outputType === 'image/webp' ? 'webp' : outputType === 'image/png' ? 'png' : 'jpg';
  const newFileName = `${nameWithoutExt}.${ext}`;

  const outputFile = new File([blob], newFileName, {
    type: outputType,
    lastModified: Date.now(),
  });

  onProgress?.(100);
  return outputFile;
}

export default shrinkImage;
