import { createHash } from "node:crypto";

export function computeFileHash(buffer: Buffer): string {
  return "sha256:" + createHash("sha256").update(buffer).digest("hex");
}
