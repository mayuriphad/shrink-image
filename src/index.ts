export type OutputType = 'image/webp' | 'image/jpeg' | 'image/png';

export interface ShrinkImageOptions {
  /** Target maximum file size in megabytes (e.g., 0.5 for 500KB). Default: 1 */
  maxSizeMB?: number;
  /** Maximum allowable width or height in pixels. Aspect ratio is preserved. Default: 1920 */
  maxWidthOrHeight?: number;
  /** Compression quality between 0.1 and 1.0. Default: 0.8 */
  initialQuality?: number;
  /** Lowest quality tried before the image is scaled down instead. Default: 0.5 */
  minQuality?: number;
  /** Smallest width or height the image is scaled down to while fitting maxSizeMB. Default: 320 */
  minWidthOrHeight?: number;
  /** Output image mime-type. Default: 'image/webp' (falls back to JPEG where the browser cannot encode WebP) */
  outputType?: OutputType;
  /** Background for formats without transparency (JPEG). Default: '#ffffff' */
  backgroundColor?: string;
  /**
   * Return the input file unchanged when it already fits maxSizeMB and maxWidthOrHeight and
   * the compressed result would be larger. Default: true
   */
  keepSmallerOriginal?: boolean;
  /** Progress callback reporting percentage from 0 to 100 */
  onProgress?: (progress: number) => void;
}

export interface ScaledDimensions {
  width: number;
  height: number;
}

const QUALITY_STEP = 0.1;
const SCALE_STEP = 0.8;
const MAX_ENCODES = 15;

/**
 * Calculates scaled dimensions preserving the original aspect ratio.
 */
export function calculateDimensions(
  origWidth: number,
  origHeight: number,
  maxDimension: number
): ScaledDimensions {
  if (!(origWidth > 0) || !(origHeight > 0)) {
    throw new RangeError(`Invalid image dimensions: ${origWidth}x${origHeight}`);
  }
  if (!(maxDimension > 0)) {
    throw new RangeError(`maxWidthOrHeight must be positive, got ${maxDimension}`);
  }
  if (origWidth <= maxDimension && origHeight <= maxDimension) {
    return { width: Math.round(origWidth), height: Math.round(origHeight) };
  }

  const ratio = origWidth / origHeight;
  if (origWidth > origHeight) {
    const width = maxDimension;
    const height = Math.max(1, Math.round(width / ratio));
    return { width, height };
  } else {
    const height = maxDimension;
    const width = Math.max(1, Math.round(height * ratio));
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
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image file. Is it a supported image format?'));
    };
    img.src = url;
  });
}

/**
 * Converts canvas to a Blob using Promise.
 */
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
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

function extensionFor(type: string): string {
  return type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg';
}

/**
 * Compresses and resizes an image File or Blob client-side.
 *
 * Quality is lowered first (down to `minQuality`); if the image still exceeds `maxSizeMB`,
 * it is scaled down step by step (down to `minWidthOrHeight`). PNG has no quality setting,
 * so it is only scaled down. The result can still exceed `maxSizeMB` once both limits are
 * reached.
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
export async function shrinkImage(file: File | Blob, options: ShrinkImageOptions = {}): Promise<File> {
  const {
    maxSizeMB = 1,
    maxWidthOrHeight = 1920,
    initialQuality = 0.8,
    minQuality = 0.5,
    minWidthOrHeight = 320,
    outputType = 'image/webp',
    backgroundColor = '#ffffff',
    keepSmallerOriginal = true,
    onProgress,
  } = options;

  if (!(maxSizeMB > 0)) {
    throw new RangeError(`maxSizeMB must be positive, got ${maxSizeMB}`);
  }

  onProgress?.(10);

  // 1. Load image into memory
  const img = await loadImage(file);
  onProgress?.(30);

  const origWidth = img.naturalWidth || img.width;
  const origHeight = img.naturalHeight || img.height;
  const maxBytes = maxSizeMB * 1024 * 1024;

  // 2. Compute target dimensions
  let { width, height } = calculateDimensions(origWidth, origHeight, maxWidthOrHeight);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to obtain 2D canvas context.');
  }

  let type: string = outputType;
  const render = () => {
    canvas.width = width;
    canvas.height = height;
    if (type === 'image/jpeg') {
      // JPEG has no alpha channel: transparent pixels would otherwise turn black
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
  };

  const qualityFloor = Math.min(1, Math.max(0.1, minQuality));
  let quality = Math.min(1, Math.max(qualityFloor, initialQuality));
  let encodes = 0;

  const encode = async (): Promise<Blob> => {
    encodes++;
    let blob = await canvasToBlob(canvas, type, quality);
    // Browsers that cannot encode the requested type (e.g. WebP on older Safari) silently
    // return a PNG. Fall back to JPEG rather than label a PNG as WebP.
    if (blob.type !== type && type !== 'image/jpeg') {
      type = 'image/jpeg';
      render();
      encodes++;
      blob = await canvasToBlob(canvas, type, quality);
    }
    return blob;
  };

  // 3. Render and encode
  render();
  onProgress?.(60);
  let blob = await encode();

  // 4. Lower quality, then scale down, until the image fits maxSizeMB
  while (blob.size > maxBytes && encodes < MAX_ENCODES) {
    const lossy = type !== 'image/png';
    if (lossy && quality - QUALITY_STEP >= qualityFloor - 1e-9) {
      quality = Math.round((quality - QUALITY_STEP) * 100) / 100;
    } else {
      const longest = Math.max(width, height);
      if (longest <= minWidthOrHeight) break;
      const next = Math.max(minWidthOrHeight, Math.round(longest * SCALE_STEP));
      ({ width, height } = calculateDimensions(width, height, next));
      render();
    }
    blob = await encode();
  }

  onProgress?.(90);

  const fitsAsIs =
    file.size <= maxBytes && origWidth <= maxWidthOrHeight && origHeight <= maxWidthOrHeight;
  if (keepSmallerOriginal && fitsAsIs && file.size <= blob.size && file instanceof File) {
    onProgress?.(100);
    return file;
  }

  // 5. Construct output File
  const originalName = file instanceof File ? file.name : 'image';
  const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
  const outputFile = new File([blob], `${nameWithoutExt}.${extensionFor(blob.type || type)}`, {
    type: blob.type || type,
    lastModified: Date.now(),
  });

  onProgress?.(100);
  return outputFile;
}

export default shrinkImage;
