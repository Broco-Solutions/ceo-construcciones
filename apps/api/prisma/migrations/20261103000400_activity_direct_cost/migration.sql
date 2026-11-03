-- Optional reusable direct unit cost. It shares the activity's explicitly
-- declared currency/tax basis; no salary or material is fabricated.
ALTER TABLE "ApuItem" ADD COLUMN "directCost" DECIMAL(24,8);
ALTER TABLE "ApuItem" ADD CONSTRAINT "ApuItem_directCost_nonnegative"
  CHECK ("directCost" IS NULL OR "directCost" >= 0);
