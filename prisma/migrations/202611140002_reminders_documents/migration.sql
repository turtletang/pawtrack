-- CreateEnum
CREATE TYPE "ReminderSource" AS ENUM ('MANUAL', 'VACCINATION');

-- CreateEnum
CREATE TYPE "ReminderCategory" AS ENUM ('MEDICATION', 'VET_APPOINTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'COMPLETED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADING', 'READY', 'DELETING');

-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN     "category" "ReminderCategory" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dismissedAt" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "source" "ReminderSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "vaccinationId" UUID;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "sizeBytes" INTEGER,
ADD COLUMN     "status" "DocumentStatus" NOT NULL DEFAULT 'READY',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "StorageObject" (
    "id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADING',
    "leaseUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorageObject_path_key" ON "StorageObject"("path");

-- CreateIndex
CREATE INDEX "StorageObject_status_leaseUntil_idx" ON "StorageObject"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "Reminder_status_dueAt_idx" ON "Reminder"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_vaccinationId_dueAt_key" ON "Reminder"("vaccinationId", "dueAt");

-- CreateIndex
CREATE INDEX "Document_petId_status_idx" ON "Document"("petId", "status");

-- Preserve the meaning of existing completed reminders.
UPDATE "Reminder" SET status = 'COMPLETED' WHERE "completedAt" IS NOT NULL;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_source_valid" CHECK (
  (source = 'MANUAL' AND "vaccinationId" IS NULL) OR (source = 'VACCINATION' AND "vaccinationId" IS NOT NULL)
);
ALTER TABLE "Document" ADD CONSTRAINT "Document_size_valid" CHECK ("sizeBytes" IS NULL OR ("sizeBytes" > 0 AND "sizeBytes" <= 10485760));
-- Private server-side inventory only. No public policies or grants are introduced.
ALTER TABLE "StorageObject" ENABLE ROW LEVEL SECURITY;

-- Track pre-existing document objects as well, without changing their paths or contents.
INSERT INTO "StorageObject" (id, path, "ownerId", "petId", status, "leaseUntil", "createdAt", "updatedAt")
SELECT d.id, d."storagePath", p."ownerId", d."petId", d.status, CURRENT_TIMESTAMP, d."createdAt", CURRENT_TIMESTAMP
FROM "Document" d JOIN "Pet" p ON p.id = d."petId";
