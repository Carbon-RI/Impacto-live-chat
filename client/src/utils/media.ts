/**
 * Infer image vs video from a Cloudinary (or similar) URL for UI rendering.
 */
export function inferMediaTypeFromUrl(url: string | null): "image" | "video" | null {
  if (!url) return null;
  const path = url.split("?")[0].toLowerCase();
  if (path.includes("/video/upload/")) return "video";
  if (path.includes("/image/upload/")) return "image";
  if (/\.(mp4|webm|mov|m4v|ogv|mkv|avi)(\b|$)/i.test(path)) return "video";
  if (/\.(jpe?g|png|gif|webp|avif|bmp|svg)(\b|$)/i.test(path)) return "image";
  return null;
}
