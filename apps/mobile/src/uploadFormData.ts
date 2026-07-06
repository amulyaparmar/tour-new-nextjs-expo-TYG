import { Platform } from "react-native";

/** Append a local recording/file URI to FormData on native and web. */
export async function appendLocalFile(
  formData: FormData,
  fieldName: string,
  fileUri: string,
  mimeType: string,
  fileName: string
) {
  if (Platform.OS === "web") {
    const response = await fetch(fileUri);
    if (!response.ok) {
      throw new Error("Could not read the selected file for upload.");
    }
    const blob = await response.blob();
    formData.append(fieldName, blob, fileName);
    return;
  }

  formData.append(
    fieldName,
    {
      uri: fileUri,
      type: mimeType,
      name: fileName,
    } as unknown as Blob
  );
}
