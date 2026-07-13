UPDATE products
SET seo = jsonb_set(COALESCE(seo, '{}'::jsonb), '{handle}', to_jsonb(public_handle), true)
WHERE COALESCE(seo->>'handle', '') <> public_handle;
