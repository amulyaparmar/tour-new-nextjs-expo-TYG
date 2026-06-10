import { NextResponse } from "next/server";
import { getSessionById, setSessionStatus, updateSession } from "@/lib/sessions";
import { storeRecording } from "@/lib/storage";

type Context = { params: Promise<{ id: string }> };

const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const session = await getSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const url = await storeRecording(id, file);

    const isVideo = VIDEO_TYPES.includes(file.type);
    await updateSession(id, isVideo ? { videoUrl: url } : { audioUrl: url });
    await setSessionStatus(id, "uploaded");

    return NextResponse.json({ url, status: "uploaded" }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 500 }
    );
  }
}
