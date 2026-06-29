ALTER TABLE products ADD COLUMN IF NOT EXISTS parcel_weight_grams integer NOT NULL DEFAULT 250
  CHECK (parcel_weight_grams > 0 AND parcel_weight_grams <= 100000);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS parcel_weight_grams integer NOT NULL DEFAULT 0
  CHECK (parcel_weight_grams >= 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parcel_weight_override_grams integer
  CHECK (parcel_weight_override_grams IS NULL OR (parcel_weight_override_grams > 0 AND parcel_weight_override_grams <= 1000000));
