import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

// Minimal ZIP reader for tests: reads the central directory, so it works with the
// data descriptors archiver writes. Supports stored and deflated entries only.
export async function readZipEntries(zipPath: string): Promise<Record<string, string>> {
  const zip = await readFile(zipPath);
  const endOfCentralDirectory = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endOfCentralDirectory === -1) {
    throw new Error("Not a ZIP file: end of central directory not found");
  }
  const entryCount = zip.readUInt16LE(endOfCentralDirectory + 10);
  let offset = zip.readUInt32LE(endOfCentralDirectory + 16);

  const entries: Record<string, string> = {};
  for (let i = 0; i < entryCount; i++) {
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localHeaderOffset = zip.readUInt32LE(offset + 42);
    const name = zip.toString("utf8", offset + 46, offset + 46 + nameLength);

    const localNameLength = zip.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = zip.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const data = zip.subarray(dataStart, dataStart + compressedSize);

    if (method !== 0 && method !== 8) {
      throw new Error(`Unsupported compression method ${method} for ${name}`);
    }
    entries[name] = (method === 8 ? inflateRawSync(data) : data).toString("utf8");
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
