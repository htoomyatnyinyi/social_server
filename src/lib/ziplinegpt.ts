// import dotenv from "dotenv";
// import crypto from "crypto";

// dotenv.config();

// const ZIPLINE_INTERNAL_URL =
//   process.env.ZIPLINE_INTERNAL_URL || "http://zipline:3000";

// const ZIPLINE_PUBLIC_URL =
//   process.env.ZIPLINE_PUBLIC_URL || "http://localhost:3000";

// /* ============================================================
//    Helpers
// ============================================================ */

// interface ParsedDataUrl {
//   buffer: Buffer;
//   mimeType: string;
//   extension: string;
// }

// function parseDataUrl(dataUrl: string): ParsedDataUrl {
//   const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl);
//   if (!match) throw new Error("Invalid base64 data URL format.");

//   const mimeType = match[1];
//   const extension = mimeType.split("/")[1] || "bin";
//   const buffer = Buffer.from(match[2], "base64");

//   return { buffer, mimeType, extension };
// }

// function buildPublicUrl(fileUrlFromZipline: string): string {
//   const parsed = new URL(fileUrlFromZipline);
//   return `${ZIPLINE_PUBLIC_URL}${parsed.pathname}`;
// }

// /* ============================================================
//    Main Upload
// ============================================================ */

// export async function uploadToZipline(
//   dataUrl: string,
//   folder = "social_app",
// ): Promise<string> {
//   const ZIPLINE_TOKEN = process.env.ZIPLINE_TOKEN;

//   if (!ZIPLINE_TOKEN) {
//     throw new Error("ZIPLINE_TOKEN is missing.");
//   }

//   const { buffer, mimeType, extension } = parseDataUrl(dataUrl);

//   const randomId = crypto.randomBytes(8).toString("hex");
//   const filename = `${folder}_${Date.now()}_${randomId}.${extension}`;

//   // Fix: Buffer → Uint8Array (Blob compatibility)
//   const uint8 = new Uint8Array(buffer);

//   const blob = new Blob([uint8], { type: mimeType });
//   const formData = new FormData();
//   formData.append("file", blob, filename);

//   // ✅ Use Headers instance (cleanest fix)
//   const headers = new Headers();
//   headers.set("Authorization", ZIPLINE_TOKEN);

//   const response = await fetch(`${ZIPLINE_INTERNAL_URL}/api/upload`, {
//     method: "POST",
//     headers,
//     body: formData,
//   });

//   if (!response.ok) {
//     const errorText = await response.text();
//     throw new Error(`Zipline upload failed (${response.status}): ${errorText}`);
//   }

//   const data = await response.json();

//   const fileUrl =
//     Array.isArray(data?.files) && data.files.length > 0
//       ? data.files[0]?.url
//       : data?.url;

//   if (!fileUrl) {
//     throw new Error(`Unexpected Zipline response: ${JSON.stringify(data)}`);
//   }

//   return buildPublicUrl(fileUrl);
// }

// export default { uploadToZipline };
