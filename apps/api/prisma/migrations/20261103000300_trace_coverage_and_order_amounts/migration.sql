CREATE TABLE "OrderAmountPolicy" (
 "orderId" TEXT PRIMARY KEY REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "precision" INTEGER NOT NULL DEFAULT 2,
 "roundingMode" TEXT NOT NULL DEFAULT 'HALF_UP',
 "boundary" TEXT NOT NULL DEFAULT 'EXTENDED_LINE',
 CONSTRAINT "OrderAmountPolicy_fixed" CHECK ("precision"=2 AND "roundingMode"='HALF_UP' AND "boundary"='EXTENDED_LINE')
);
CREATE TABLE "ReceiptCoverage" (
 "receiptLineId" TEXT PRIMARY KEY REFERENCES "ReceiptLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "reservationId" TEXT NOT NULL REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ReceiptCoverage_reservationId_key" ON "ReceiptCoverage"("reservationId");
-- Historical orders/receipts intentionally keep their original policy and
-- coverage unknown. No inferred allocation or stock movement is backfilled.
