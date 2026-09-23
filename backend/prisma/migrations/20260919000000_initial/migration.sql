-- Matches the previous PostgreSQL table so existing installations can be baselined.
-- Prisma does not represent CHECK constraints in schema.prisma; retain them here.
CREATE TABLE "generations" (
  "id" TEXT NOT NULL,
  "company_name" TEXT NOT NULL,
  "job_title" TEXT NOT NULL,
  "resume_filename" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  "status" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  CONSTRAINT "generations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "generations_status_check" CHECK ("status" = 'mock_completed'),
  CONSTRAINT "generations_source_check" CHECK ("source" IN ('seed', 'submission'))
);
CREATE INDEX "generations_created" ON "generations"("created_at" DESC);
