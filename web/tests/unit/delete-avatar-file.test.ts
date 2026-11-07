// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteAvatarFile } from "@/lib/uploads/delete-avatar-file";

describe("deleteAvatarFile", () => {
  let uploadsDir: string;

  beforeEach(async () => {
    uploadsDir = await mkdtemp(path.join(tmpdir(), "uploads-test-"));
  });

  afterEach(async () => {
    await rm(uploadsDir, { recursive: true, force: true });
  });

  it("borra un fichero que existe", async () => {
    await writeFile(path.join(uploadsDir, "avatar.png"), "img");

    await deleteAvatarFile("avatar.png", uploadsDir);

    await expect(readFile(path.join(uploadsDir, "avatar.png"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("no falla si el fichero ya no existe", async () => {
    await expect(deleteAvatarFile("missing.png", uploadsDir)).resolves.toBeUndefined();
  });

  // Each case builds a path that points at a file outside uploadsDir
  it.each([
    ["con ../", (outside: string) => `../${path.basename(outside)}`],
    ["con ../ en medio", (outside: string) => `sub/../../${path.basename(outside)}`],
    ["absoluta", (outside: string) => outside],
  ])("rechaza una ruta %s y no toca el fichero de fuera", async (_name, buildPath) => {
    const outside = path.join(path.dirname(uploadsDir), `${path.basename(uploadsDir)}-outside.txt`);
    await writeFile(outside, "keep me");

    try {
      await expect(deleteAvatarFile(buildPath(outside), uploadsDir)).rejects.toThrow();
      expect(await readFile(outside, "utf8")).toBe("keep me");
    } finally {
      await rm(outside, { force: true });
    }
  });

  it("rechaza un directorio hermano con el mismo prefijo que uploadsDir", async () => {
    // <uploadsDir>-evil is NOT inside <uploadsDir>, even though its name starts the same
    const sibling = `${uploadsDir}-evil`;
    await mkdir(sibling);
    await writeFile(path.join(sibling, "x.png"), "keep me");

    try {
      await expect(deleteAvatarFile(`../${path.basename(sibling)}/x.png`, uploadsDir)).rejects.toThrow();
      expect(await readFile(path.join(sibling, "x.png"), "utf8")).toBe("keep me");
    } finally {
      await rm(sibling, { recursive: true, force: true });
    }
  });

  it("rechaza una ruta absoluta aunque apunte dentro de uploadsDir y deja el fichero", async () => {
    const inside = path.join(uploadsDir, "avatar.png");
    await writeFile(inside, "keep me");

    await expect(deleteAvatarFile(inside, uploadsDir)).rejects.toThrow();

    expect(await readFile(inside, "utf8")).toBe("keep me");
  });

  it.each([["vacía", ""], ["'.'", "."]])("rechaza una ruta %s", async (_name, emptyPath) => {
    await expect(deleteAvatarFile(emptyPath, uploadsDir)).rejects.toThrow();
  });

  it("propaga los errores que no son ENOENT", async () => {
    // A directory cannot be unlinked: the error must reach the caller
    await mkdir(path.join(uploadsDir, "a-directory"));

    await expect(deleteAvatarFile("a-directory", uploadsDir)).rejects.toThrow();
  });
});
