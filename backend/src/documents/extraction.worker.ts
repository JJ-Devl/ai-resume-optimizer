import { fromBuffer, type Entry } from "yauzl";
import { extractRawText } from "mammoth";
import { PDFParse } from "pdf-parse";

// Inspect and stream every ZIP entry before Mammoth expands the archive.
// Both declared and actual expanded sizes are bounded; nothing is written to disk.
async function validateDocx(buffer: Buffer) {
  await new Promise<void>((resolve, reject) => {
    fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip) return reject(new Error("Invalid DOCX archive."));
        let declared = 0;
        let actual = 0;
        let count = 0;
        const names = new Set<string>();
        const fail = () => {
          zip.close();
          reject(
            new Error("Invalid, encrypted, or excessively large DOCX archive."),
          );
        };
        zip.on("error", fail);
        zip.on("entry", (entry: Entry) => {
          declared += entry.uncompressedSize;
          if (
            ++count > 1000 ||
            declared > 20 * 1024 * 1024 ||
            entry.generalPurposeBitFlag & 1 ||
            names.has(entry.fileName) ||
            /(^|\/)\.\.\/|\\/.test(entry.fileName) ||
            entry.fileName.startsWith("/")
          )
            return fail();
          names.add(entry.fileName);
          zip.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) return fail();
            stream.on("error", fail);
            stream.on("data", (chunk: Buffer) => {
              actual += chunk.length;
              if (actual > 20 * 1024 * 1024) {
                stream.destroy();
                fail();
              }
            });
            stream.on("end", () => zip.readEntry());
          });
        });
        zip.on("end", () => {
          if (
            !["[Content_Types].xml", "_rels/.rels", "word/document.xml"].every(
              (name) => names.has(name),
            )
          )
            reject(new Error("This ZIP archive is not a DOCX document."));
          else resolve();
        });
        zip.readEntry();
      },
    );
  });
}

async function extract(workerData: { bytes: Buffer; extension: string }) {
  const buffer = Buffer.from(workerData.bytes);
  let text: string;
  if (workerData.extension === "pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const info = await parser.getInfo();
      if (info.total > 50) throw new Error("Use a PDF with 50 pages or fewer.");
      text = (await parser.getText({ pageJoiner: "\n\n" })).text;
    } finally {
      await parser.destroy();
    }
  } else {
    await validateDocx(buffer);
    text = (await extractRawText({ buffer })).value;
  }
  text = text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .trim();
  if (!text)
    throw new Error(
      workerData.extension === "pdf"
        ? "No selectable text was found. Scanned or image-only PDFs need OCR first; upload a text-based PDF or DOCX."
        : "No readable text was found in this DOCX.",
    );
  if (text.length > 200000)
    throw new Error(
      "This document contains too much text. Use a shorter resume.",
    );
  process.send!({ text });
}

process.once("message", (data: { bytes: Buffer; extension: string }) => {
  void extract(data).catch((error: unknown) => {
    // Only return our controlled messages, never parser internals or document text.
    const message = error instanceof Error ? error.message : "";
    const safe =
      /^(Use a PDF|No selectable text|No readable text|This document contains|This ZIP archive|Invalid, encrypted)/.test(
        message,
      );
    process.send!({
      error: safe
        ? message
        : "Could not read this document. It may be corrupt or password-protected. Export an unencrypted PDF or DOCX and try again.",
    });
  });
});
