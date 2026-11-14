-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pet" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "species" VARCHAR(40) NOT NULL,
    "breed" VARCHAR(100),
    "dateOfBirth" DATE,
    "sex" "Sex",
    "weight" DECIMAL(6,2),
    "photoUrl" VARCHAR(2048),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeightRecord" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "weightKg" DECIMAL(6,2) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeightRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vaccination" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "administeredAt" TIMESTAMP(3) NOT NULL,
    "nextDueAt" TIMESTAMP(3),

    CONSTRAINT "Vaccination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VetVisit" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL,
    "clinic" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "VetVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medication" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "instructions" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),

    CONSTRAINT "Medication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pet_ownerId_createdAt_idx" ON "Pet"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "WeightRecord_petId_recordedAt_idx" ON "WeightRecord"("petId", "recordedAt");

-- CreateIndex
CREATE INDEX "Vaccination_petId_administeredAt_idx" ON "Vaccination"("petId", "administeredAt");

-- CreateIndex
CREATE INDEX "VetVisit_petId_visitedAt_idx" ON "VetVisit"("petId", "visitedAt");

-- CreateIndex
CREATE INDEX "Medication_petId_idx" ON "Medication"("petId");

-- CreateIndex
CREATE INDEX "Reminder_petId_dueAt_idx" ON "Reminder"("petId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storagePath_key" ON "Document"("storagePath");

-- CreateIndex
CREATE INDEX "Document_petId_idx" ON "Document"("petId");

-- AddForeignKey
ALTER TABLE "Pet" ADD CONSTRAINT "Pet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeightRecord" ADD CONSTRAINT "WeightRecord_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vaccination" ADD CONSTRAINT "Vaccination_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VetVisit" ADD CONSTRAINT "VetVisit_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- No client-facing Data API access. The server database role performs ownership checks.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Pet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WeightRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vaccination" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VetVisit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Medication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Pet" ADD CONSTRAINT "Pet_weight_positive" CHECK ("weight" IS NULL OR "weight" > 0);
ALTER TABLE "WeightRecord" ADD CONSTRAINT "WeightRecord_weightKg_positive" CHECK ("weightKg" > 0);
