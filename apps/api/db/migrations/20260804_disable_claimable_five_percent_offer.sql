-- Retire the one-time popup offer without deleting its historical usage data.
UPDATE discount_codes
SET status = 'disabled', updated_at = now()
WHERE code = 'CLAIM5';
