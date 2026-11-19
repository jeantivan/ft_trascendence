// @vitest-environment node
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeExportZip } from "@/lib/gdpr/export/write-export-zip";
import { readZipEntries } from "../support/read-zip-entries";

describe("writeExportZip", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "export-zip-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("escribe un ZIP con los ficheros dados, también con acentos", async () => {
    const destination = path.join(dir, "export.zip");

    await writeExportZip(
      [
        { name: "data.json", content: '{"nick":"runner42"}' },
        { name: "README.txt", content: "Zona horaria: UTC. ¿Dudas? Escríbenos." },
      ],
      destination,
    );

    expect(await readZipEntries(destination)).toEqual({
      "data.json": '{"nick":"runner42"}',
      "README.txt": "Zona horaria: UTC. ¿Dudas? Escríbenos.",
    });
  });

  it("crea la carpeta de destino y no deja ficheros temporales", async () => {
    const destination = path.join(dir, "exports", "abc.zip");

    await writeExportZip([{ name: "a.txt", content: "a" }], destination);

    expect(await readdir(path.join(dir, "exports"))).toEqual(["abc.zip"]);
  });

  it("si falla, rechaza y no deja ni el ZIP final ni el temporal", async () => {
    // The parent of the destination is a regular file, so the folder cannot be created
    const blocker = path.join(dir, "blocker");
    await writeFile(blocker, "not a folder");

    await expect(
      writeExportZip([{ name: "a.txt", content: "a" }], path.join(blocker, "abc.zip")),
    ).rejects.toThrow();

    expect(await readdir(dir)).toEqual(["blocker"]);
  });

  it("si falla la escritura del ZIP, borra el temporal y no crea el final", async () => {
    // An empty entry name makes archiver throw while the file is already open
    const destination = path.join(dir, "abc.zip");

    await expect(
      writeExportZip([{ name: "", content: "a" }], destination),
    ).rejects.toThrow();

    expect(await readdir(dir)).toEqual([]);
  });
});
