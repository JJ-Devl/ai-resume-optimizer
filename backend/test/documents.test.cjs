const { test } = require("node:test");
const assert = require("node:assert/strict");
const { crc32 } = require("node:zlib");
const { Module } = require("@nestjs/common");
const { NestFactory } = require("@nestjs/core");
const {
  DocumentsController,
} = require("../dist/documents/documents.controller");
const { DocumentsService } = require("../dist/documents/documents.service");
const { ApiExceptionFilter } = require("../dist/common/api-exception.filter");

// Small real documents, generated locally without personal resume data.
function pdf(text = "Resume preview test") {
  const stream = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let data = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(data));
    data += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(data);
  data += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(data);
}

function zip(files) {
  const local = [],
    central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const filename = Buffer.from(name),
      content = Buffer.from(text);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc32(content), 14);
    header.writeUInt32LE(content.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(filename.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt32LE(crc32(content), 16);
    record.writeUInt32LE(content.length, 20);
    record.writeUInt32LE(content.length, 24);
    record.writeUInt16LE(filename.length, 28);
    record.writeUInt32LE(offset, 42);
    local.push(header, filename, content);
    central.push(record, filename);
    offset += header.length + filename.length + content.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

function docx(text = "Resume preview test") {
  return zip({
    "[Content_Types].xml":
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/document.xml": `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  });
}

test("multipart preview endpoint with real PDF and DOCX parsers", async (t) => {
  class TestModule {}
  Module({ controllers: [DocumentsController], providers: [DocumentsService] })(
    TestModule,
  );
  const app = await NestFactory.create(TestModule, {
    logger: ["error"],
    abortOnError: false,
  });
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const post = (
    bytes,
    filename = "resume.pdf",
    type = "application/pdf",
    extra,
  ) => {
    const form = new FormData();
    if (bytes !== null)
      form.append("resume", new Blob([bytes], { type }), filename);
    if (extra) extra(form);
    return fetch(base + "/api/documents/preview", {
      method: "POST",
      body: form,
    });
  };
  try {
    for (const [name, bytes, mime] of [
      ["resume.pdf", pdf(), "application/pdf"],
      [
        "resume.docx",
        docx(),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      ["RESUME.PDF", pdf(), "application/octet-stream"],
    ])
      await t.test(`extracts ${name}`, async () => {
        const response = await post(bytes, name, mime);
        const body = await response.json();
        assert.equal(response.status, 201, JSON.stringify(body));
        assert.match(body.text, /Resume preview test/);
        assert.equal(body.originalFilename, name);
        assert.equal(response.headers.get("cache-control"), "no-store");
      });
    for (const [name, bytes, filename, mime, status, extra] of [
      ["missing", null, "resume.pdf", "application/pdf", 400],
      ["empty", Buffer.alloc(0), "resume.pdf", "application/pdf", 400],
      [
        "oversized",
        Buffer.alloc(5 * 1024 * 1024 + 1),
        "resume.pdf",
        "application/pdf",
        413,
      ],
      [
        "fake PDF",
        Buffer.from("not a PDF"),
        "resume.pdf",
        "application/pdf",
        415,
      ],
      [
        "corrupt PDF",
        Buffer.from("%PDF-broken"),
        "resume.pdf",
        "application/pdf",
        422,
      ],
      ["unsupported extension", pdf(), "resume.exe", "application/pdf", 415],
      ["mismatched MIME", pdf(), "resume.pdf", "image/png", 415],
      ["no PDF text", pdf(""), "resume.pdf", "application/pdf", 422],
      [
        "ordinary ZIP",
        zip({ "hello.txt": "hi" }),
        "resume.docx",
        "application/octet-stream",
        422,
      ],
      ["empty DOCX", docx(""), "resume.docx", "application/octet-stream", 422],
      [
        "too much text",
        docx("x".repeat(200001)),
        "resume.docx",
        "application/octet-stream",
        422,
      ],
      [
        "too many ZIP entries",
        zip(
          Object.fromEntries(
            Array.from({ length: 1001 }, (_, i) => [`entry${i}`, ""]),
          ),
        ),
        "resume.docx",
        "application/octet-stream",
        422,
      ],
      [
        "ZIP traversal",
        zip({ "../outside.txt": "bad" }),
        "resume.docx",
        "application/octet-stream",
        422,
      ],
      [
        "extra field",
        pdf(),
        "resume.pdf",
        "application/pdf",
        400,
        (f) => f.append("unexpected", "yes"),
      ],
      [
        "extra file",
        pdf(),
        "resume.pdf",
        "application/pdf",
        400,
        (f) => f.append("resume", new Blob([pdf()]), "two.pdf"),
      ],
    ])
      await t.test(`rejects ${name}`, async () => {
        const response = await post(bytes, filename, mime, extra);
        const body = await response.json();
        assert.equal(response.status, status, JSON.stringify(body));
        assert.equal(typeof body.error.message, "string");
        if (name === "no PDF text") assert.match(body.error.message, /OCR/);
        if (name === "oversized")
          assert.equal(body.error.code, "FILE_TOO_LARGE");
      });
  } finally {
    await app.close();
  }
});

test("browser validation accepts supported files and rejects invalid inputs", () => {
  const { validateResume } = require("../../src/lib/documents/validation.ts");
  assert.equal(
    validateResume({ name: "resume.PDF", size: 5242880, type: "" }),
    null,
  );
  for (const file of [
    null,
    { name: "x.exe", size: 1 },
    { name: "x.pdf", size: 0 },
    { name: "x.pdf", size: 5242881 },
    { name: "x.docx", size: 100, type: "image/png" },
  ])
    assert.equal(typeof validateResume(file), "string");
});
