-- CreateTable
CREATE TABLE "LaborResource" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaborResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborRate" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "value" DECIMAL(24,8) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "taxBasis" "TaxBasis" NOT NULL,
    "effectiveAt" TIMESTAMP(3),
    "dateLabel" TEXT,
    "datePrecision" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaborRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityCosting" (
    "itemId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityCosting_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "CatalogOrigin" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "installedHash" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogOrigin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogLoadRun" (
    "id" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogLoadRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LaborResource_code_key" ON "LaborResource"("code");

-- CreateIndex
CREATE INDEX "LaborRate_resourceId_series_effectiveAt_idx" ON "LaborRate"("resourceId", "series", "effectiveAt");

-- CreateIndex
CREATE INDEX "CatalogOrigin_kind_entityId_idx" ON "CatalogOrigin"("kind", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogOrigin_source_kind_sourceKey_key" ON "CatalogOrigin"("source", "kind", "sourceKey");

-- AddForeignKey
ALTER TABLE "LaborRate" ADD CONSTRAINT "LaborRate_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "LaborResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LaborRate" ADD CONSTRAINT "LaborRate_value_nonnegative" CHECK ("value" >= 0);
ALTER TABLE "LaborRate" ADD CONSTRAINT "LaborRate_actor_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "ActivityCosting" ADD CONSTRAINT "ActivityCosting_item_fkey" FOREIGN KEY ("itemId") REFERENCES "ApuItem"("id") ON DELETE RESTRICT;
ALTER TABLE "ActivityCosting" ADD CONSTRAINT "ActivityCosting_revision_positive" CHECK ("revision" > 0);
ALTER TABLE "CatalogLoadRun" ADD CONSTRAINT "CatalogLoadRun_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "LaborRate" ADD CONSTRAINT "LaborRate_date_precision" CHECK (("datePrecision" = 'UNKNOWN' AND "effectiveAt" IS NULL) OR ("datePrecision" IN ('DAY', 'MONTH') AND "effectiveAt" IS NOT NULL));

CREATE FUNCTION ceo_immutable_labor_rate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Labor rates are append-only'; END;
$$;
CREATE TRIGGER labor_rate_append_only BEFORE UPDATE OR DELETE ON "LaborRate" FOR EACH ROW EXECUTE FUNCTION ceo_immutable_labor_rate();

