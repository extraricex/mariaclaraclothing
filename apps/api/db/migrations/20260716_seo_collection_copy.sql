UPDATE store_settings AS settings
SET value = jsonb_set(
  value,
  '{collectionDefinitions}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN collection->>'slug' = 'new-arrivals'
          AND collection->>'description' = 'Oversized premium shirt.'
          THEN jsonb_set(collection, '{description}', to_jsonb('Explore the latest Maria Clara Clothing releases in oversized, regular-fit, and crop-box cuts. Each product page shows current size availability, measurements, price, and delivery information.'::text))
        WHEN collection->>'slug' = 'tees'
          AND collection->>'description' = 'Regular Fit Tees with premium quality shirt.'
          THEN jsonb_set(collection, '{description}', to_jsonb('Shop Maria Clara Clothing tees in oversized, regular-fit, and crop-box cuts made for everyday streetwear. Compare real garment measurements and available sizes before ordering.'::text))
        ELSE collection
      END
      ORDER BY ordinal
    )
    FROM jsonb_array_elements(COALESCE(value->'collectionDefinitions', '[]'::jsonb)) WITH ORDINALITY AS records(collection, ordinal)
  ),
  true
), updated_at = now()
WHERE key = 'storeSettings'
  AND jsonb_typeof(value->'collectionDefinitions') = 'array';
