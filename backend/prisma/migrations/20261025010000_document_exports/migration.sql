-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "document_error" TEXT,
ADD COLUMN     "document_lease_until" TIMESTAMPTZ(6),
ADD COLUMN     "document_status" TEXT NOT NULL DEFAULT 'not_generated',
ADD COLUMN     "document_token" TEXT,
ADD COLUMN     "documents_generated_at" TIMESTAMPTZ(6),
ADD COLUMN     "template_version" TEXT;

-- CreateTable
CREATE TABLE "document_exports" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "template_version" TEXT NOT NULL,
    "docx_key" TEXT NOT NULL,
    "pdf_key" TEXT NOT NULL,

    CONSTRAINT "document_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_exports_docx_key_key" ON "document_exports"("docx_key");

-- CreateIndex
CREATE UNIQUE INDEX "document_exports_pdf_key_key" ON "document_exports"("pdf_key");

-- CreateIndex
CREATE INDEX "document_exports_application" ON "document_exports"("application_id");

-- AddForeignKey
ALTER TABLE "document_exports" ADD CONSTRAINT "document_exports_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "document_exports_one_ready" ON "document_exports" ("application_id") WHERE state = 'ready';
ALTER TABLE "applications" ADD CONSTRAINT "application_document_status_check" CHECK (document_status IN ('not_generated', 'generating', 'ready', 'failed', 'deleting', 'delete_failed'));
ALTER TABLE "document_exports" ADD CONSTRAINT "document_exports_state_check" CHECK (state IN ('pending', 'ready', 'obsolete'));
