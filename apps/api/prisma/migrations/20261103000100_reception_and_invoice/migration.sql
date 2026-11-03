CREATE TABLE "ReceptionDelegation" (
  "userId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "locationId"),
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ReceptionDelegation_locationId_idx" ON "ReceptionDelegation"("locationId");
CREATE TABLE "OrderInvoiceInfo" (
  "orderId" TEXT PRIMARY KEY,
  "amount" DECIMAL(24,8),
  "currency" VARCHAR(3),
  "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "changedById" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (("amount" IS NULL AND "currency" IS NULL) OR ("amount" >= 0 AND "currency" ~ '^[A-Z]{3}$')),
  CHECK ("paymentStatus" IN ('PENDING', 'PAID'))
);
