import { NextResponse } from "next/server";
import { ingestFile } from "@/lib/pipeline/ingest";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_FILES_PER_REQUEST = 20;

export async function POST(request: Request) {
  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "업로드된 파일이 없습니다" }, { status: 400 });
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      { error: `한 번에 최대 ${MAX_FILES_PER_REQUEST}개까지 업로드할 수 있습니다` },
      { status: 400 },
    );
  }

  const results = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      results.push({
        fileName: file.name,
        status: "rejected" as const,
        anomalies: [`파일 크기가 ${MAX_FILE_BYTES / 1024 / 1024}MB를 초과함`],
      });
      continue;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      const summary = await ingestFile(file.name, buffer);
      results.push(summary);
    } catch (err) {
      results.push({
        fileName: file.name,
        status: "rejected" as const,
        anomalies: [
          `처리 중 오류 발생: ${err instanceof Error ? err.message : String(err)}`,
        ],
      });
    }
  }

  return NextResponse.json({ results });
}
