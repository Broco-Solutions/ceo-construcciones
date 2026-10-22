-- Contadores por tipo de entidad; sin alterar registros ni codigos existentes.
CREATE TABLE "CodeCounter" (
    "entity" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CodeCounter_pkey" PRIMARY KEY ("entity")
);

-- Conservar continuidad para datos previos e importaciones con prefijo estandar.
INSERT INTO "CodeCounter" ("entity", "lastValue") VALUES
 ('works', COALESCE((SELECT MAX((SUBSTRING("code" FROM '^OBR-([0-9]+)$'))::INTEGER) FROM "Work"), 0)),
 ('suppliers', COALESCE((SELECT MAX((SUBSTRING("code" FROM '^PRV-([0-9]+)$'))::INTEGER) FROM "Supplier"), 0)),
 ('categories', COALESCE((SELECT MAX((SUBSTRING("code" FROM '^RUB-([0-9]+)$'))::INTEGER) FROM "Category"), 0)),
 ('units', COALESCE((SELECT MAX((SUBSTRING("code" FROM '^UNI-([0-9]+)$'))::INTEGER) FROM "Unit"), 0)),
 ('materials', COALESCE((SELECT MAX((SUBSTRING("code" FROM '^MAT-([0-9]+)$'))::INTEGER) FROM "Material"), 0)),
 ('locations', COALESCE((SELECT MAX((SUBSTRING("code" FROM '^UBI-([0-9]+)$'))::INTEGER) FROM "Location"), 0)),
 ('apu-items', COALESCE((SELECT MAX((SUBSTRING("code" FROM '^APU-([0-9]+)$'))::INTEGER) FROM "ApuItem"), 0));
