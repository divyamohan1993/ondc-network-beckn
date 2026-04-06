import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink, access } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "@ondc/shared/utils";

const logger = createLogger("image-service");

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const MAX_WIDTH = 1024;
const MAX_HEIGHT = 1024;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

export class ImageService {
  private uploadDir: string;

  constructor(uploadDir?: string) {
    this.uploadDir = uploadDir || UPLOAD_DIR;
  }

  async init(): Promise<void> {
    await mkdir(this.uploadDir, { recursive: true });
    logger.info({ uploadDir: this.uploadDir }, "Image service initialized");
  }

  /**
   * Process and save an uploaded image.
   * - Validates type and size
   * - Resizes to max dimensions preserving aspect ratio
   * - Converts to WebP for compression
   * - Returns the public URL path
   */
  async processUpload(buffer: Buffer, mimetype: string, originalName: string): Promise<{
    filename: string;
    url: string;
    width: number;
    height: number;
    size: number;
  }> {
    // Validate type
    if (!ALLOWED_TYPES.includes(mimetype)) {
      throw new Error(`Unsupported image type: ${mimetype}. Allowed: ${ALLOWED_TYPES.join(", ")}`);
    }

    // Validate size
    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB. Max: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Process with sharp
    const id = randomUUID();
    const filename = `${id}.webp`;
    const outputPath = join(this.uploadDir, filename);

    const result = await sharp(buffer)
      .resize(MAX_WIDTH, MAX_HEIGHT, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toFile(outputPath);

    logger.info({
      originalName,
      filename,
      width: result.width,
      height: result.height,
      size: result.size,
    }, "Image processed and saved");

    return {
      filename,
      url: `/uploads/${filename}`,
      width: result.width,
      height: result.height,
      size: result.size,
    };
  }

  /**
   * Delete an uploaded image.
   */
  async deleteImage(filename: string): Promise<void> {
    const filepath = join(this.uploadDir, filename);
    try {
      await access(filepath);
      await unlink(filepath);
      logger.info({ filename }, "Image deleted");
    } catch {
      logger.warn({ filename }, "Image not found for deletion");
    }
  }
}
