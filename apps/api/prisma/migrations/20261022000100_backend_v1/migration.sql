-- CreateEnum
CREATE TYPE "Role" AS ENUM ('GERENCIA', 'COMPRAS', 'COMPUTO', 'JEFE_OBRA');

-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LocationKind" AS ENUM ('WAREHOUSE', 'YARD', 'WORK');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'REFERENCE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PROCESSING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'RECEIVED', 'SELECTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('INITIAL', 'RECEIPT', 'TRANSFER', 'CONSUMPTION', 'RETURN', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TaxBasis" AS ENUM ('UNSPECIFIED', 'INCLUDED', 'EXCLUDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthAttempt" (
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WorkStatus" NOT NULL DEFAULT 'ACTIVE',
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkAssignment" (
    "userId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkAssignment_pkey" PRIMARY KEY ("userId","workId")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "LocationKind" NOT NULL,
    "workId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "categoryId" TEXT,
    "minimum" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Presentation" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "supplierId" TEXT,
    "name" TEXT NOT NULL,
    "baseQuantity" DECIMAL(24,8) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Presentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialPrice" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "supplierId" TEXT,
    "presentationId" TEXT,
    "price" DECIMAL(24,8) NOT NULL,
    "baseQuantity" DECIMAL(24,8) NOT NULL DEFAULT 1,
    "currency" VARCHAR(3) NOT NULL,
    "taxBasis" "TaxBasis" NOT NULL DEFAULT 'UNSPECIFIED',
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,

    CONSTRAINT "MaterialPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApuItem" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "laborCost" DECIMAL(24,8),
    "laborCurrency" VARCHAR(3),
    "laborTaxBasis" "TaxBasis" NOT NULL DEFAULT 'UNSPECIFIED',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApuMaterial" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "coefficient" DECIMAL(24,8) NOT NULL,

    CONSTRAINT "ApuMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Computation" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Computation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComputationLine" (
    "id" TEXT NOT NULL,
    "computationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(24,8) NOT NULL,

    CONSTRAINT "ComputationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetVersion" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" VARCHAR(3) NOT NULL,
    "taxBasis" "TaxBasis" NOT NULL DEFAULT 'UNSPECIFIED',
    "precision" INTEGER NOT NULL,
    "roundingMode" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetMaterial" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "quantity" DECIMAL(36,16) NOT NULL,

    CONSTRAINT "BudgetMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialRequest" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "categoryId" TEXT,
    "requestedById" TEXT NOT NULL,
    "requiredAt" TIMESTAMP(3),
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestLine" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DECIMAL(24,8) NOT NULL,

    CONSTRAINT "RequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "supplierId" TEXT NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" VARCHAR(3) NOT NULL,
    "taxBasis" "TaxBasis" NOT NULL DEFAULT 'UNSPECIFIED',
    "validUntil" TIMESTAMP(3),
    "deliveryTerms" TEXT,
    "notes" TEXT,
    "selectedById" TEXT,
    "selectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationLine" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "presentationId" TEXT,
    "quantity" DECIMAL(24,8) NOT NULL,
    "unitPrice" DECIMAL(24,8) NOT NULL,
    "baseQuantity" DECIMAL(24,8) NOT NULL DEFAULT 1,

    CONSTRAINT "QuotationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "supplierId" TEXT NOT NULL,
    "workId" TEXT,
    "requestId" TEXT,
    "quotationId" TEXT,
    "destinationId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" VARCHAR(3) NOT NULL,
    "taxBasis" "TaxBasis" NOT NULL DEFAULT 'UNSPECIFIED',
    "notes" TEXT,
    "invoiceNumber" TEXT,
    "invoiceLoadedAt" TIMESTAMP(3),
    "invoiceLoadedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "presentationId" TEXT,
    "quantity" DECIMAL(24,8) NOT NULL,
    "receivedQuantity" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(24,8) NOT NULL,
    "baseQuantity" DECIMAL(24,8) NOT NULL DEFAULT 1,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "receivedById" TEXT NOT NULL,
    "deliveryNote" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "quantity" DECIMAL(24,8) NOT NULL,

    CONSTRAINT "ReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBalance" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "physical" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "minimum" DECIMAL(24,8),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "requestLineId" TEXT,
    "quantity" DECIMAL(24,8) NOT NULL,
    "fulfilledQuantity" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DECIMAL(24,8) NOT NULL,
    "sourceId" TEXT,
    "destinationId" TEXT,
    "workId" TEXT,
    "reservationId" TEXT,
    "receiptLineId" TEXT,
    "createdById" TEXT NOT NULL,
    "reason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Work_code_key" ON "Work"("code");

-- CreateIndex
CREATE INDEX "WorkAssignment_workId_idx" ON "WorkAssignment"("workId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_code_key" ON "Location"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Location_workId_key" ON "Location"("workId");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_code_key" ON "Unit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Category_code_key" ON "Category"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_taxId_key" ON "Supplier"("taxId");

-- CreateIndex
CREATE UNIQUE INDEX "Material_code_key" ON "Material"("code");

-- CreateIndex
CREATE INDEX "MaterialPrice_materialId_effectiveAt_idx" ON "MaterialPrice"("materialId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApuMaterial_itemId_materialId_key" ON "ApuMaterial"("itemId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetVersion_budgetId_number_key" ON "BudgetVersion"("budgetId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetMaterial_versionId_categoryId_materialId_key" ON "BudgetMaterial"("versionId", "categoryId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "RequestLine_requestId_materialId_key" ON "RequestLine"("requestId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_number_key" ON "PurchaseOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_idempotencyKey_key" ON "Receipt"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptLine_receiptId_orderLineId_key" ON "ReceiptLine"("receiptId", "orderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBalance_materialId_locationId_key" ON "StockBalance"("materialId", "locationId");

-- CreateIndex
CREATE INDEX "Reservation_sourceId_materialId_status_idx" ON "Reservation"("sourceId", "materialId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_receiptLineId_key" ON "StockMovement"("receiptLineId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_idempotencyKey_key" ON "StockMovement"("idempotencyKey");

-- CreateIndex
CREATE INDEX "StockMovement_workId_materialId_type_idx" ON "StockMovement"("workId", "materialId", "type");

-- CreateIndex
CREATE INDEX "StockMovement_materialId_createdAt_idx" ON "StockMovement"("materialId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAssignment" ADD CONSTRAINT "WorkAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAssignment" ADD CONSTRAINT "WorkAssignment_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialPrice" ADD CONSTRAINT "MaterialPrice_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialPrice" ADD CONSTRAINT "MaterialPrice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialPrice" ADD CONSTRAINT "MaterialPrice_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApuItem" ADD CONSTRAINT "ApuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApuItem" ADD CONSTRAINT "ApuItem_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApuMaterial" ADD CONSTRAINT "ApuMaterial_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ApuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApuMaterial" ADD CONSTRAINT "ApuMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Computation" ADD CONSTRAINT "Computation_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComputationLine" ADD CONSTRAINT "ComputationLine_computationId_fkey" FOREIGN KEY ("computationId") REFERENCES "Computation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComputationLine" ADD CONSTRAINT "ComputationLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ApuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetVersion" ADD CONSTRAINT "BudgetVersion_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetMaterial" ADD CONSTRAINT "BudgetMaterial_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "BudgetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetMaterial" ADD CONSTRAINT "BudgetMaterial_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetMaterial" ADD CONSTRAINT "BudgetMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetMaterial" ADD CONSTRAINT "BudgetMaterial_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestLine" ADD CONSTRAINT "RequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MaterialRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestLine" ADD CONSTRAINT "RequestLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MaterialRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MaterialRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_requestLineId_fkey" FOREIGN KEY ("requestLineId") REFERENCES "RequestLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_receiptLineId_fkey" FOREIGN KEY ("receiptLineId") REFERENCES "ReceiptLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Invariantes de dominio adicionales a las relaciones Prisma.
ALTER TABLE "AuthAttempt" ADD CONSTRAINT "AuthAttempt_failures_nonnegative" CHECK ("failures" >= 0);
ALTER TABLE "Location" ADD CONSTRAINT "Location_work_kind" CHECK (("kind" = 'WORK') = ("workId" IS NOT NULL));
ALTER TABLE "Material" ADD CONSTRAINT "Material_minimum_nonnegative" CHECK ("minimum" >= 0);
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_base_quantity_positive" CHECK ("baseQuantity" > 0);
ALTER TABLE "MaterialPrice" ADD CONSTRAINT "MaterialPrice_price_positive" CHECK ("price" > 0 AND "baseQuantity" > 0);
ALTER TABLE "MaterialPrice" ADD CONSTRAINT "MaterialPrice_currency_valid" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "ApuItem" ADD CONSTRAINT "ApuItem_labor_nonnegative" CHECK ("laborCost" IS NULL OR "laborCost" >= 0);
ALTER TABLE "ApuItem" ADD CONSTRAINT "ApuItem_labor_currency" CHECK ("laborCost" IS NULL OR "laborCurrency" IS NOT NULL);
ALTER TABLE "ApuMaterial" ADD CONSTRAINT "ApuMaterial_coefficient_positive" CHECK ("coefficient" > 0);
ALTER TABLE "ComputationLine" ADD CONSTRAINT "ComputationLine_quantity_nonnegative" CHECK ("quantity" >= 0);
ALTER TABLE "BudgetVersion" ADD CONSTRAINT "BudgetVersion_number_positive" CHECK ("number" > 0);
ALTER TABLE "BudgetVersion" ADD CONSTRAINT "BudgetVersion_precision_valid" CHECK ("precision" BETWEEN 0 AND 8);
ALTER TABLE "BudgetVersion" ADD CONSTRAINT "BudgetVersion_currency_valid" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "BudgetMaterial" ADD CONSTRAINT "BudgetMaterial_quantity_nonnegative" CHECK ("quantity" >= 0);
ALTER TABLE "RequestLine" ADD CONSTRAINT "RequestLine_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_selection_complete" CHECK (("selectedById" IS NULL) = ("selectedAt" IS NULL));
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_quantities_positive" CHECK ("quantity" > 0 AND "baseQuantity" > 0 AND "unitPrice" >= 0);
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_invoice_complete" CHECK (("invoiceNumber" IS NULL AND "invoiceLoadedAt" IS NULL AND "invoiceLoadedById" IS NULL) OR ("invoiceNumber" IS NOT NULL AND "invoiceLoadedAt" IS NOT NULL AND "invoiceLoadedById" IS NOT NULL));
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_quantities_valid" CHECK ("quantity" > 0 AND "receivedQuantity" >= 0 AND "receivedQuantity" <= "quantity" AND "baseQuantity" > 0 AND "unitPrice" >= 0);
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_quantities_valid" CHECK ("physical" >= 0 AND "reserved" >= 0 AND "reserved" <= "physical" AND ("minimum" IS NULL OR "minimum" >= 0));
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_quantities_valid" CHECK ("quantity" > 0 AND "fulfilledQuantity" >= 0 AND "fulfilledQuantity" <= "quantity");
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_status_quantity" CHECK (("status" <> 'FULFILLED' OR "fulfilledQuantity" = "quantity") AND ("status" <> 'ACTIVE' OR "fulfilledQuantity" < "quantity"));
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_quantity_nonzero" CHECK ("quantity" <> 0);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_quantity_positive_except_adjustment" CHECK ("type" = 'ADJUSTMENT' OR "quantity" > 0);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_distinct_locations" CHECK ("sourceId" IS NULL OR "destinationId" IS NULL OR "sourceId" <> "destinationId");
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_location_shape" CHECK (("type" IN ('INITIAL', 'RECEIPT') AND "sourceId" IS NULL AND "destinationId" IS NOT NULL) OR ("type" IN ('TRANSFER', 'RETURN') AND "sourceId" IS NOT NULL AND "destinationId" IS NOT NULL) OR ("type" = 'CONSUMPTION' AND "sourceId" IS NOT NULL AND "destinationId" IS NULL AND "workId" IS NOT NULL) OR ("type" = 'ADJUSTMENT' AND ("sourceId" IS NOT NULL OR "destinationId" IS NOT NULL)));
ALTER TABLE "BudgetVersion" ADD CONSTRAINT "BudgetVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_selectedById_fkey" FOREIGN KEY ("selectedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_invoiceLoadedById_fkey" FOREIGN KEY ("invoiceLoadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Los snapshots económicos sólo se crean; una revisión genera otra versión.
CREATE FUNCTION protect_budget_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'budget snapshots are immutable' USING ERRCODE = '23514';
  END IF;
  IF ROW(NEW."budgetId", NEW."number", NEW."currency", NEW."taxBasis", NEW."precision", NEW."roundingMode", NEW."createdById", NEW."snapshot", NEW."createdAt")
     IS DISTINCT FROM
     ROW(OLD."budgetId", OLD."number", OLD."currency", OLD."taxBasis", OLD."precision", OLD."roundingMode", OLD."createdById", OLD."snapshot", OLD."createdAt") THEN
    RAISE EXCEPTION 'budget snapshots are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER budget_snapshot_immutable BEFORE UPDATE OR DELETE ON "BudgetVersion"
FOR EACH ROW EXECUTE FUNCTION protect_budget_snapshot();

CREATE FUNCTION protect_budget_material() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'budget material snapshots are immutable' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER budget_material_immutable BEFORE UPDATE OR DELETE ON "BudgetMaterial"
FOR EACH ROW EXECUTE FUNCTION protect_budget_material();

ALTER TABLE "StockMovement" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
