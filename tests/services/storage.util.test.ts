import { afterEach, describe, expect, it, vi } from "vitest";

import { randomUUID } from "node:crypto";
import { readFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

import { deleteCheckinEvidence, saveCheckinEvidence } from "../../server/utils/storage";

vi.mock("node:crypto", async () => {
  const actual = await vi.importActual<typeof import("node:crypto")>("node:crypto");
  return {
    ...actual,
    randomUUID: vi.fn(),
  };
});

afterEach(async () => {
  const checkinsDir = join(process.cwd(), "public", "uploads", "checkins");
  const cleanupFiles = ["test-file-id.png", "to-delete-id.jpg"];

  await Promise.allSettled(cleanupFiles.map((name) => unlink(join(checkinsDir, name))));

  vi.clearAllMocks();
});

describe("storage utils", () => {
  it("saveCheckinEvidence: 成功保存文件并返回路径与大小", async () => {
    vi.mocked(randomUUID).mockReturnValue("test-file-id");

    const content = Buffer.from("hello-image");
    const saved = await saveCheckinEvidence(content, "proof.png");

    expect(saved).toEqual({
      filePath: "/uploads/checkins/test-file-id.png",
      fileSize: content.length,
    });

    const absolutePath = join(process.cwd(), "public", saved.filePath.replace(/^\//, ""));
    const fileContent = await readFile(absolutePath);
    expect(fileContent.equals(content)).toBe(true);

    const fileStats = await stat(absolutePath);
    expect(fileStats.isFile()).toBe(true);
  });

  it("deleteCheckinEvidence: 删除已保存文件", async () => {
    vi.mocked(randomUUID).mockReturnValue("to-delete-id");

    const saved = await saveCheckinEvidence(Buffer.from("to-delete"), "proof.jpg");
    const absolutePath = join(process.cwd(), "public", saved.filePath.replace(/^\//, ""));

    await expect(stat(absolutePath)).resolves.toBeDefined();

    await deleteCheckinEvidence(saved.filePath);

    await expect(stat(absolutePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("deleteCheckinEvidence: 非法路径不应误删", async () => {
    await expect(deleteCheckinEvidence("/uploads/../sneaky.txt")).resolves.toBeUndefined();
    await expect(deleteCheckinEvidence("/not-uploads/checkins/x.jpg")).resolves.toBeUndefined();
  });
});
