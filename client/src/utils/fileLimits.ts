const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_VIDEO_BYTES = 10 * 1024 * 1024;

export type MediaFileKind = "image" | "video" | "unknown";

export function getMediaFileKind(file: File): MediaFileKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  const name = file.name.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|avif|bmp|svg)$/.test(name)) return "image";
  if (/\.(mp4|webm|mov|m4v|ogv|mkv|avi)$/.test(name)) return "video";
  return "unknown";
}

/** Returns a Japanese error message if invalid; otherwise `null`. */
export function validateMediaFileSize(file: File): string | null {
  const kind = getMediaFileKind(file);
  if (kind === "unknown") {
    return "Please select an image or video file.";
  }
  if (kind === "image" && file.size > MAX_IMAGE_BYTES) {
    return "Image files must be 2MB or smaller.";
  }
  if (kind === "video" && file.size > MAX_VIDEO_BYTES) {
    return "Video files must be 10MB or smaller.";
  }
  return null;
}
