ALTER TABLE customer_accounts ADD COLUMN IF NOT EXISTS first_name text NOT NULL DEFAULT '';
ALTER TABLE customer_accounts ADD COLUMN IF NOT EXISTS last_name text NOT NULL DEFAULT '';

UPDATE customer_accounts
   SET first_name = CASE
         WHEN first_name <> '' THEN first_name
         ELSE split_part(trim(regexp_replace(full_name, '\s+', ' ', 'g')), ' ', 1)
       END,
       last_name = CASE
         WHEN last_name <> '' THEN last_name
         ELSE trim(regexp_replace(trim(regexp_replace(full_name, '\s+', ' ', 'g')), '^\S+\s*', ''))
       END
 WHERE full_name <> '';
