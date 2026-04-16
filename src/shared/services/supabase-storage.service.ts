import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private supabaseClient: SupabaseClient | null = null;
  private readonly bucketName: string;

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
      const timestamp = Date.now();
      const filename = `${fieldId}-${timestamp}-${file.originalname}`;
      const filepath = `fields/${filename}`;

      const { error, data } = await this.supabaseClient.storage
        .from(this.bucketName)
        .upload(filepath, file.buffer, {
          contentType: file.mimetype,
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
      // Extract the file path from the public URL
      const urlParts = imageUrl.split("/");
      const filepath = urlParts
        .slice(urlParts.indexOf(this.bucketName) + 1)
        .join("/");

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

  /**
   * Check if Supabase is properly configured
   */
  isConfigured(): boolean {
    return this.supabaseClient !== null;
  }
}
