CREATE TABLE "BudgetDraft" (
  "budgetId" TEXT PRIMARY KEY,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "content" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BudgetDraft_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BudgetDraft_revision_check" CHECK ("revision" > 0)
);
CREATE TABLE "BudgetTemplate" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "BudgetIssue" (
  "versionId" TEXT PRIMARY KEY,
  "contentHash" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "commercialTotal" DECIMAL(36,16) NOT NULL,
  CONSTRAINT "BudgetIssue_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "BudgetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BudgetIssue_total_check" CHECK ("commercialTotal" >= 0)
);
CREATE INDEX "BudgetIssue_contentHash_idx" ON "BudgetIssue"("contentHash");
CREATE FUNCTION ceo_issue_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Las emisiones comerciales son inmutables'; END;
$$;
CREATE TRIGGER "BudgetIssue_immutable" BEFORE UPDATE OR DELETE ON "BudgetIssue" FOR EACH ROW EXECUTE FUNCTION ceo_issue_immutable();
