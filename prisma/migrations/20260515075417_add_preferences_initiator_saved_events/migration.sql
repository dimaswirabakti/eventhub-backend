-- CreateEnum
CREATE TYPE "OfferInitiator" AS ENUM ('COMPANY', 'EO');

-- AlterTable
ALTER TABLE "company_profiles" ADD COLUMN     "preferences" JSONB;

-- AlterTable
ALTER TABLE "sponsorship_offers" ADD COLUMN     "initiatedBy" "OfferInitiator" NOT NULL DEFAULT 'COMPANY';

-- CreateTable
CREATE TABLE "saved_events" (
    "companyProfileId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_events_pkey" PRIMARY KEY ("companyProfileId","eventId")
);

-- CreateIndex
CREATE INDEX "saved_events_companyProfileId_createdAt_idx" ON "saved_events"("companyProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "sponsorship_offers_initiatedBy_idx" ON "sponsorship_offers"("initiatedBy");

-- AddForeignKey
ALTER TABLE "saved_events" ADD CONSTRAINT "saved_events_companyProfileId_fkey" FOREIGN KEY ("companyProfileId") REFERENCES "company_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_events" ADD CONSTRAINT "saved_events_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
