import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { ZipArchive } from "archiver";

export type ExportFile = { name: string; content: string };

// Writes the ZIP to <destination>.tmp and renames it to <destination> only after the
// destination stream has closed, so a half-written ZIP never has its final name (#165).
// Resolves when the file is complete on disk; rejects (and removes the .tmp file) on any
// error. Callers mark the export `ready` only after this resolves.
export async function writeExportZip(files: ExportFile[], destination: string): Promise<void> {
  const tmpPath = `${destination}.tmp`;
  try {
    await mkdir(path.dirname(destination), { recursive: true });
    await writeZip(files, tmpPath);
    await rename(tmpPath, destination);
  } catch (error) {
    await rm(tmpPath, { force: true });
    throw error;
  }
}

function writeZip(files: ExportFile[], filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(filePath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    let failure: unknown;

    // Settle only once the file descriptor is closed: the caller removes the .tmp file
    // right after a rejection, and a still-open file would be left behind.
    const fail = (error: unknown) => {
      if (failure !== undefined) return;
      failure = error;
      archive.unpipe(output);
      output.destroy();
    };
    output.on("close", () => (failure === undefined ? resolve() : reject(failure)));

    // Listeners go before finalize(): an error emitted while finalizing must not be lost.
    // ENOENT is archiver's "file not found" warning; any other warning is a real problem.
    output.on("error", fail);
    archive.on("error", fail);
    archive.on("warning", (warning) => {
      if (warning.code !== "ENOENT") fail(warning);
    });

    archive.pipe(output);
    try {
      for (const file of files) {
        archive.append(file.content, { name: file.name });
      }
    } catch (error) {
      fail(error);
      return;
    }
    archive.finalize().catch(fail);
  });
}
