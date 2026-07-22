CREATE UNIQUE INDEX IF NOT EXISTS orders_meta_controlled_test_reference_idx
  ON orders ((payment_metadata->>'metaTestReference'))
  WHERE payment_metadata->>'metaControlledTest' = 'true'
    AND COALESCE(payment_metadata->>'metaTestReference', '') <> '';
