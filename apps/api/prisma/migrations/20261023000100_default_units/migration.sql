-- Símbolo visible opcional (m², kg, jornal). Las unidades existentes no se modifican.
ALTER TABLE "Unit" ADD COLUMN IF NOT EXISTS "symbol" TEXT;

-- Clave de comparación: minúsculas, sin acentos, ²/³ como 2/3 y sin espacios ni puntos.
-- "M", "mts", "Metros" y "metro" comparten clave; así una unidad cargada a mano no se duplica.
CREATE OR REPLACE FUNCTION pg_temp.ceo_unit_key(v TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $f$
  SELECT regexp_replace(translate(lower(coalesce(v, '')), 'áéíóúüàèìòù²³', 'aeiouuaeiou23'), '[^a-z0-9]', '', 'g')
$f$;

-- Catálogo inicial de unidades habituales en obra. Idempotente y no destructivo:
-- * Se inserta una unidad sólo si ninguna existente coincide por nombre, código o símbolo
--   con alguno de sus alias. Nunca se renombran, borran ni convierten unidades existentes.
-- * Los códigos salen del contador "units" (UNI-###), igual que un alta desde la aplicación,
--   salteando valores ya ocupados; la secuencia nunca retrocede.
-- * Puede ejecutarse más de una vez sin crear duplicados.
-- "ml" se toma como metro lineal (uso habitual en obra), no como mililitro.
DO $$
DECLARE
  d RECORD;
  next_value INTEGER;
  candidate TEXT;
BEGIN
  INSERT INTO "CodeCounter" ("entity", "lastValue") VALUES ('units', 0) ON CONFLICT ("entity") DO NOTHING;

  FOR d IN
    SELECT * FROM (VALUES
      (1,  'Unidad',         'un',     ARRAY['un', 'u', 'und', 'unid', 'unidad', 'unidades']),
      (2,  'Metro',          'm',      ARRAY['m', 'mt', 'mts', 'metro', 'metros', 'ml', 'metrolineal', 'metroslineales']),
      (3,  'Metro cuadrado', 'm²',     ARRAY['m2', 'mt2', 'mts2', 'metrocuadrado', 'metroscuadrados']),
      (4,  'Metro cúbico',   'm³',     ARRAY['m3', 'mt3', 'mts3', 'metrocubico', 'metroscubicos']),
      (5,  'Centímetro',     'cm',     ARRAY['cm', 'cms', 'centimetro', 'centimetros']),
      (6,  'Milímetro',      'mm',     ARRAY['mm', 'milimetro', 'milimetros']),
      (7,  'Kilogramo',      'kg',     ARRAY['kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos']),
      (8,  'Gramo',          'g',      ARRAY['g', 'gr', 'grs', 'gramo', 'gramos']),
      (9,  'Tonelada',       't',      ARRAY['t', 'tn', 'tns', 'ton', 'tonelada', 'toneladas']),
      (10, 'Litro',          'L',      ARRAY['l', 'lt', 'lts', 'litro', 'litros']),
      (11, 'Mililitro',      'mL',     ARRAY['mililitro', 'mililitros', 'cc', 'cm3']),
      (12, 'Hora',           'h',      ARRAY['h', 'hs', 'hr', 'hrs', 'hora', 'horas']),
      (13, 'Jornal',         'jornal', ARRAY['jornal', 'jornales', 'jor']),
      (14, 'Día',            'día',    ARRAY['d', 'dia', 'dias']),
      (15, 'Global',         'gl',     ARRAY['gl', 'glb', 'gbl', 'global', 'globales'])
    ) AS t(pos, name, symbol, aliases)
    ORDER BY pos
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM "Unit" u
      WHERE pg_temp.ceo_unit_key(u."name") = ANY (d.aliases)
         OR pg_temp.ceo_unit_key(u."code") = ANY (d.aliases)
         OR pg_temp.ceo_unit_key(u."symbol") = ANY (d.aliases)
    ) THEN
      LOOP
        UPDATE "CodeCounter" SET "lastValue" = "lastValue" + 1
        WHERE "entity" = 'units'
        RETURNING "lastValue" INTO next_value;
        candidate := 'UNI-' || lpad(next_value::TEXT, greatest(3, length(next_value::TEXT)), '0');
        EXIT WHEN NOT EXISTS (SELECT 1 FROM "Unit" WHERE "code" = candidate);
      END LOOP;
      INSERT INTO "Unit" ("id", "code", "name", "symbol")
      VALUES (gen_random_uuid()::TEXT, candidate, d.name, d.symbol);
    END IF;
  END LOOP;
END
$$;

DROP FUNCTION IF EXISTS pg_temp.ceo_unit_key(TEXT);
