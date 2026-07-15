-- Read-only production audit. Output intentionally contains only the order
-- number, status, and missing field names; it never prints customer PII.
WITH audited AS (
  SELECT
    order_number,
    status,
    array_remove(ARRAY[
      CASE WHEN coalesce(length(btrim(customer->>'phone')), 0) = 0 THEN 'phone' END,
      CASE WHEN coalesce(length(btrim(address->>'houseAddress')), 0) = 0 THEN 'street' END,
      CASE WHEN coalesce(length(btrim(address->>'barangay')), 0) = 0 THEN 'barangay' END,
      CASE WHEN coalesce(length(btrim(address->>'city')), 0) = 0 THEN 'city' END,
      CASE WHEN coalesce(length(btrim(address->>'province')), 0) = 0 THEN 'province' END
    ], NULL) AS missing_fields
  FROM orders
)
SELECT
  order_number,
  status,
  array_to_string(missing_fields, ',') AS missing_fields
FROM audited
WHERE cardinality(missing_fields) > 0
ORDER BY order_number;
