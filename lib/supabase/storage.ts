import { supabase } from "./client";
import * as FileSystem from "expo-file-system/legacy";

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
  const dataUrl = `data:${contentType ?? "application/octet-stream"};base64,${base64}`;
  const resp = await fetch(dataUrl);
  if (!resp.ok) throw new Error("Could not create Blob from file data.");
  const blob = await resp.blob();
  const { error } = await supabase
    .storage
    .from("pr_files")
    .upload(remotePath, blob, {
      contentType: contentType ?? "application/octet-stream",
      upsert: true,
    });
  if (error) throw error;
  const { data } = supabase.storage.from("pr_files").getPublicUrl(remotePath);
  return { path: remotePath, publicUrl: data.publicUrl };
}

