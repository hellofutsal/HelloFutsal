import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

type SupportedImageType = "image/jpeg" | "image/png" | "image/webp";

@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private supabaseClient: SupabaseClient | null = null;
  private readonly bucketName: string;
  private readonly supportedImageTypes: SupportedImageType[] = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  constructor(private readonly configService: ConfigService) {
    this.bucketName =
      this.configService.get<string>("SUPABASE_STORAGE_BUCKET") ??
      "field-images";
    this.initializeSupabaseClient();
  }

  private initializeSupabaseClient(): void {
    const supabaseUrl = this.configService.get<string>("SUPABASE_URL");
    const supabaseServiceRoleKey = this.configService.get<string>(
      "SUPABASE_SERVICE_ROLE_KEY",
    );
    const supabaseAnonKey = this.configService.get<string>("SUPABASE_ANON_KEY");
    const supabaseKey = supabaseServiceRoleKey ?? supabaseAnonKey;

    if (!supabaseUrl || !supabaseKey) {
      this.logger.warn(
        "Supabase credentials not configured (SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY are required). Image upload will be disabled.",
      );
      return;
    }

    if (!supabaseServiceRoleKey) {
      this.logger.warn(
        "SUPABASE_SERVICE_ROLE_KEY not found. Using SUPABASE_ANON_KEY for storage operations may fail with RLS policies.",
      );
    }

    this.supabaseClient = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Upload a field image to Supabase storage
   * @param file - The image file to upload
   * @param fieldId - The field ID to use as part of the file path
   * @returns The public URL of the uploaded image, or null if upload is disabled
   */
  async uploadFieldImage(
    file: Express.Multer.File,
    fieldId: string,
  ): Promise<string | null> {
    if (!this.supabaseClient) {
      this.logger.warn(
        "Supabase client not initialized. Skipping image upload.",
      );
      return null;
    }

    try {
      const detectedMimeType = this.detectImageMimeType(file.buffer);
      if (!detectedMimeType) {
        throw new Error(
          "Unsupported image file type. Only JPEG, PNG, and WebP are allowed.",
        );
      }

      if (
        file.mimetype &&
        this.supportedImageTypes.includes(
          file.mimetype as SupportedImageType,
        ) &&
        file.mimetype !== detectedMimeType
      ) {
        this.logger.warn(
          `MIME type mismatch detected. client=${file.mimetype}, detected=${detectedMimeType}`,
        );
      }

      const timestamp = Date.now();
      const sanitizedOriginalName = this.sanitizeOriginalFilename(
        file.originalname,
      );
      const filename = `${fieldId}-${timestamp}-${sanitizedOriginalName}`;
      const filepath = `fields/${filename}`;

      const { error } = await this.supabaseClient.storage
        .from(this.bucketName)
        .upload(filepath, file.buffer, {
          contentType: detectedMimeType,
          upsert: false,
        });

      if (error) {
        this.logger.error(`Failed to upload image: ${error.message}`);
        throw new Error(`Image upload failed: ${error.message}`);
      }

      // Get the public URL for the uploaded file
      const {
        data: { publicUrl },
      } = this.supabaseClient.storage
        .from(this.bucketName)
        .getPublicUrl(filepath);

      this.logger.log(`Image uploaded successfully for field ${fieldId}`);
      return publicUrl;
    } catch (error) {
      this.logger.error(
        `Error uploading image for field ${fieldId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Delete a field image from Supabase storage
   * @param imageUrl - The public URL of the image to delete
   */
  async deleteFieldImage(imageUrl: string | null): Promise<void> {
    if (!imageUrl || !this.supabaseClient) {
      return;
    }

    try {
      const filepath = this.extractBucketRelativePath(imageUrl);
      if (!filepath) {
        this.logger.warn(
          `Skipping image delete because bucket-relative path could not be extracted from URL: ${imageUrl}`,
        );
        return;
      }

      const { error } = await this.supabaseClient.storage
        .from(this.bucketName)
        .remove([filepath]);

      if (error) {
        this.logger.error(`Failed to delete image: ${error.message}`);
        return;
      }

      this.logger.log(`Image deleted successfully: ${filepath}`);
    } catch (error) {
      this.logger.error(
        `Error deleting image: ${imageUrl}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private detectImageMimeType(buffer: Buffer): SupportedImageType | null {
    if (buffer.length < 12) {
      return null;
    }

    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return "image/jpeg";
    }

    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return "image/png";
    }

    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return "image/webp";
    }

    return null;
  }

  private sanitizeOriginalFilename(originalName: string): string {
    const baseName = originalName.split(/[\\/]/).pop() ?? "image";
    const cleaned = baseName
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .replace(/-+/g, "-")
      .slice(0, 80);

    const safeName = cleaned || "image";
    return safeName.toLowerCase();
  }

  private extractBucketRelativePath(imageUrl: string): string | null {
    try {
      const parsedUrl = new URL(imageUrl);
      const storageSegment = `/object/public/${this.bucketName}/`;
      const privateStorageSegment = `/object/${this.bucketName}/`;

      if (parsedUrl.pathname.includes(storageSegment)) {
        return decodeURIComponent(parsedUrl.pathname.split(storageSegment)[1]);
      }

      if (parsedUrl.pathname.includes(privateStorageSegment)) {
        return decodeURIComponent(
          parsedUrl.pathname.split(privateStorageSegment)[1],
        );
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check if Supabase is properly configured
   */
  isConfigured(): boolean {
    return this.supabaseClient !== null;
  }
}
