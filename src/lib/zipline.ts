/**
 * Zipline upload helper
 *
 * Uploads files (base64 data-URLs) to a self-hosted Zipline instance which
 * stores them in MinIO (S3).  Returns the public URL of the uploaded file.
 */

import dotenv from "dotenv";
dotenv.config();

// const ZIPLINE_URL = process.env.ZIPLINE_URL || "http://zipline:3000"; // i need to change to http://localhost:3000
const ZIPLINE_URL = process.env.ZIPLINE_URL; // i need to change to http://localhost:3000
const ZIPLINE_TOKEN = process.env.ZIPLINE_TOKEN || "";

/**
 * Convert a base64 data-URL (e.g. "data:image/png;base64,iVBOR…") into a
 * { buffer, mimeType, extension } triple.
 */
function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL");

  const mimeType = match[1]; // e.g. "image/png"
  const extension = mimeType.split("/")[1] || "bin"; // e.g. "png"
  const buffer = Buffer.from(match[2], "base64");

  return { buffer, mimeType, extension };
}

/**
 * Upload a base64-encoded data-URL to Zipline.
 *
 * @param dataUrl  – A full data-URL string  (data:image/png;base64,…)
 * @param folder   – Optional virtual "folder" hint stored in the filename
 * @returns The public URL of the uploaded file
 */
export async function uploadToZipline(
  dataUrl: string,
  folder = "social_app",
): Promise<string> {
  if (!ZIPLINE_TOKEN) {
    throw new Error(
      "ZIPLINE_TOKEN is not set – generate one from the Zipline admin panel",
    );
  }

  const { buffer, mimeType, extension } = parseDataUrl(dataUrl);

  // Build a unique filename
  const filename = `${folder}_${Date.now()}.${extension}`;

  // Zipline expects a multipart/form-data upload with the file in a field
  // named "file".  We use the native Blob/FormData available in Bun.
  const blob = new Blob([buffer], { type: mimeType });
  const formData = new FormData();
  formData.append("file", blob, filename);

  const response = await fetch(`${ZIPLINE_URL}/api/upload`, {
    method: "POST",
    headers: {
      Authorization: ZIPLINE_TOKEN,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Zipline upload failed:", response.status, errorText);
    throw new Error(`Zipline upload failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  // Zipline returns an array of file objects – we uploaded one file
  // Each object has a `url` property with the public URL
  if (Array.isArray(data?.files) && data.files.length > 0) {
    return data.files[0].url;
  }

  // Fallback: some Zipline versions return { url: "..." } directly
  if (data?.url) {
    return data.url;
  }

  console.error("Unexpected Zipline response:", JSON.stringify(data));
  throw new Error("Unexpected response format from Zipline");
}

export default { uploadToZipline };
