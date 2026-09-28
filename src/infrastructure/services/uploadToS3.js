import { S3Client, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const s3 = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1", // Fallback to avoid crash if missing, but log remains
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * @param {string | object | object[]} source
 * @param {string} destinationFolder
 * @returns {Promise<string[]>} - uploaded S3 URLs
 */
export async function uploadToS3(source, destinationFolder = "audio") {
  try {
    const uploadedUrls = [];

    const getContentType = (ext) => {
      if ([".m3u8"].includes(ext)) return "application/x-mpegURL";
      if ([".ts"].includes(ext)) return "video/MP2T";
      if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return "image/jpeg";
      if ([".mp4", ".mov", ".mkv"].includes(ext)) return "video/mp4";
      if ([".mp3", ".wav"].includes(ext)) return "audio/mpeg";
      return "application/octet-stream";
    };

    let filesToUpload = [];

    if (Array.isArray(source)) {
      filesToUpload = source;
    } else if (typeof source === "object") {
      filesToUpload = [source];
    } else if (typeof source === "string") {
      const isDirectory = fs.lstatSync(source).isDirectory();
      const filePaths = isDirectory
        ? fs.readdirSync(source).map((f) => path.join(source, f))
        : [source];

      filesToUpload = filePaths.map((filePath) => ({
        path: filePath,
        name: path.basename(filePath),
      }));
    } else {
      throw new Error(
        "Invalid source type. Must be local path or file object(s).",
      );
    }

    for (const file of filesToUpload) {
      let fileBuffer;
      let fileName;

      if (file.toBuffer && typeof file.toBuffer === "function") {
        fileBuffer = await file.toBuffer();
        fileName = file.filename || file.name;
      } else if (file.buffer) {
        fileBuffer = file.buffer;
        fileName = file.originalname || file.name;
      } else if (file.path) {
        fileBuffer = fs.readFileSync(file.path);
        fileName = file.name || path.basename(file.path);
      } else {
        throw new Error("File object missing buffer, path, or toBuffer()");
      }

      const ext = path.extname(fileName).toLowerCase();
      const contentType = getContentType(ext);
      const s3Key = `${destinationFolder}/${fileName}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: s3Key,
          Body: fileBuffer,
          ContentType: contentType,
        }),
      );

      uploadedUrls.push(`${process.env.CLOUDFRONT_URL}/${s3Key}`);
    }

    return uploadedUrls;
  } catch (error) {
    console.log(error);
    return [];
  }
}

/**
 * Generate a presigned URL for direct frontend upload
 * @param {string} fileName - Original file name
 * @param {string} fileType - MIME type of the file
 * @param {string} destinationFolder - Folder to upload to (default 'audio/tmp')
 * @returns {Promise<{presignedUrl: string, key: string}>}
 */
export async function generatePresignedUrl(fileName, fileType, destinationFolder = "audio/tmp") {
  try {
    const s3Key = `${destinationFolder}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: s3Key,
      ContentType: fileType,
    });

    // URL expires in 1 hour (3600 seconds)
    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    return {
      presignedUrl,
      key: s3Key,
      url: `${process.env.CLOUDFRONT_URL}/${s3Key}`
    };
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    throw new Error("Failed to generate presigned URL");
  }
}

/**
 * Move an object within S3 (Copy then Delete)
 * @param {string} sourceKey - The key of the object to move
 * @param {string} destinationKey - The new key for the object
 * @returns {Promise<string>} - The new CloudFront URL
 */
export async function moveS3Object(sourceKey, destinationKey) {
  try {
    const bucket = process.env.AWS_S3_BUCKET;
    
    // 1. Copy the object
    await s3.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: encodeURI(`${bucket}/${sourceKey}`),
        Key: destinationKey,
      })
    );

    // 2. Delete the original object
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: sourceKey,
      })
    );

    return `${process.env.CLOUDFRONT_URL}/${destinationKey}`;
  } catch (error) {
    console.error("Error moving S3 object:", error);
    throw new Error("Failed to move S3 object");
  }
}
