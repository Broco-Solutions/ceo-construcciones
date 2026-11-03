-- A declared zero is a reference price; absence remains NULL/no reference.
-- No existing price or unit equivalence is rewritten.
ALTER TABLE "MaterialPrice" DROP CONSTRAINT "MaterialPrice_price_positive";
ALTER TABLE "MaterialPrice" ADD CONSTRAINT "MaterialPrice_price_positive"
  CHECK ("price" >= 0 AND "baseQuantity" > 0);
