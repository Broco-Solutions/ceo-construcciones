-- Additive expansion for the Etapa 1 commercial flow. Existing works stay
-- readable without a client until their real mapping is completed.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ADMINISTRACION';

CREATE TABLE "Client" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "taxId" TEXT,
  "contact" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Client_code_key" ON "Client"("code");
CREATE UNIQUE INDEX "Client_taxId_key" ON "Client"("taxId");
INSERT INTO "CodeCounter" ("entity", "lastValue") VALUES ('clients', 0) ON CONFLICT ("entity") DO NOTHING;

ALTER TABLE "Work" ADD COLUMN "clientId" TEXT;
ALTER TABLE "Work" ADD COLUMN "address" TEXT;
CREATE INDEX "Work_clientId_idx" ON "Work"("clientId");
ALTER TABLE "Work" ADD CONSTRAINT "Work_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
