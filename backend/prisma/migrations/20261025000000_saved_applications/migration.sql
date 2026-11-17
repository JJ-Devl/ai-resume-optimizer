-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "company_name" TEXT NOT NULL,
    "job_title" TEXT NOT NULL,
    "resume_filename" TEXT NOT NULL,
    "resume_format" TEXT NOT NULL,
    "original_text" TEXT NOT NULL,
    "job_description" TEXT NOT NULL,
    "job_url" TEXT,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "resume" JSONB NOT NULL,
    "resume_text" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "skills_added" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "reasoning_tokens" INTEGER NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "applications_created" ON "applications"("created_at" DESC, "id" DESC);

ALTER TABLE "applications"
  ADD CONSTRAINT "applications_format_check" CHECK ("resume_format" IN ('pdf', 'docx')),
  ADD CONSTRAINT "applications_tokens_check" CHECK ("input_tokens" >= 0 AND "output_tokens" >= 0 AND "reasoning_tokens" >= 0),
  ADD CONSTRAINT "applications_resume_object" CHECK (jsonb_typeof("resume") = 'object');
