import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./client";

function normalizeSegment(s: string) {
  return (s || "UNK").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function formatDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function guessContentType(filename?: string | null): string {
  const ext = (filename ?? "").split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    txt: "text/plain",
    csv: "text/csv",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext] || "application/octet-stream";
}

export function buildRemotePath(
  prNo: string,
  filename: string,
  now = new Date(),
) {
  const pr = normalizeSegment(prNo);
  const name = normalizeSegment(filename);
  const stamp = `${formatDate(now)}/${now.getTime()}-${name}`;
  return `${pr}/${stamp}`;
}

import { decode } from "base64-arraybuffer"; // npm install base64-arraybuffer

export async function uploadPRFile(
  localUri: string,
  remotePath: string,
  contentType?: string,
): Promise<{ path: string; publicUrl: string }> {
  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists) throw new Error("Selected file no longer exists.");
  if (typeof info.size === "number" && info.size > 20 * 1024 * 1024) {
    throw new Error("File is too large. Maximum size is 20 MB.");
  }

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // ✅ Decode base64 directly to ArrayBuffer — no fetch() needed
  const arrayBuffer = decode(base64);

  const { error } = await supabase.storage
    .from("pr_files")
    .upload(remotePath, arrayBuffer, {
      contentType: contentType ?? "application/octet-stream",
      upsert: true,
    });

  if (error) throw error;

  const { data } = supabase.storage.from("pr_files").getPublicUrl(remotePath);
  return { path: remotePath, publicUrl: data.publicUrl };
}

//   const base64 = await FileSystem.readAsStringAsync(localUri, {
//     encoding: FileSystem.EncodingType.Base64,
//   });
//   const dataUrl = `data:${contentType ?? "application/octet-stream"};base64,${base64}`;
//   const resp = await fetch(dataUrl);
//   if (!resp.ok) throw new Error("Could not create Blob from file data.");
//   const blob = await resp.blob();
//   const { error } = await supabase.storage
//     .from("pr_files")
//     .upload(remotePath, blob, {
//       contentType: contentType ?? "application/octet-stream",
//       upsert: true,
//     });
//   if (error) throw error;
//   const { data } = supabase.storage.from("pr_files").getPublicUrl(remotePath);
//   return { path: remotePath, publicUrl: data.publicUrl };
// }
