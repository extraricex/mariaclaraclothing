UPDATE store_settings
SET value = replace(
  replace(
    value::text,
    'All orders are Cash on Delivery and are reviewed before fulfillment. We may contact you by text or phone, and reserve the right to hold or cancel orders with invalid or unreachable contact details.',
    'Orders may use any enabled payment method shown at checkout, including Cash on Delivery or secure online payment through PayMongo. COD orders are reviewed before fulfillment, and online-payment orders are confirmed only after the payment provider verifies payment. We may contact you by text or phone and may hold or cancel orders with invalid or unreachable contact details.'
  ),
  'Pay securely using GCash, Maya, card, QRPh, or online banking through PayMongo.',
  'Continue to PayMongo secure checkout. The payment methods currently available for your order will appear there. Your order is confirmed only after PayMongo verifies payment.'
)::jsonb,
updated_at = now()
WHERE key = 'storeSettings';

WITH payment_methods AS (
  SELECT settings.key,
         jsonb_agg(
           CASE
             WHEN method.value->>'id' = 'paymongo' THEN jsonb_set(
               method.value,
               '{instructions}',
               to_jsonb('Continue to PayMongo secure checkout. The payment methods currently available for your order will appear there. Your order is confirmed only after PayMongo verifies payment.'::text),
               true
             )
             ELSE method.value
           END
           ORDER BY method.ordinality
         ) AS methods
  FROM store_settings AS settings
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(settings.value#>'{payments,methods}', '[]'::jsonb))
    WITH ORDINALITY AS method(value, ordinality)
  WHERE settings.key = 'storeSettings'
  GROUP BY settings.key
)
UPDATE store_settings AS settings
SET value = jsonb_set(settings.value, '{payments,methods}', payment_methods.methods, true),
    updated_at = now()
FROM payment_methods
WHERE settings.key = payment_methods.key;

UPDATE store_settings
SET value = jsonb_set(
      value,
      '{website,infoPages,faq}',
      COALESCE(value#>'{website,infoPages,faq}', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'heading', 'How does online payment work?',
        'body', 'Choose Online Payment at checkout to continue to PayMongo. The payment methods currently available for your order appear on the secure PayMongo page. Your order is confirmed after PayMongo verifies successful payment.'
      )),
      true
    ),
    updated_at = now()
WHERE key = 'storeSettings'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(value#>'{payments,methods}', '[]'::jsonb)) AS method
    WHERE method->>'id' = 'paymongo' AND COALESCE((method->>'enabled')::boolean, false)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(value#>'{website,infoPages,faq}', '[]'::jsonb)) AS entry
    WHERE entry->>'heading' = 'How does online payment work?'
  );

UPDATE products
SET name = regexp_replace(name, ' Copy$', ''),
    product_page = CASE
      WHEN product_page ? 'heading'
        THEN jsonb_set(product_page, '{heading}', to_jsonb(regexp_replace(product_page->>'heading', ' Copy$', '')))
      ELSE product_page
    END,
    updated_at = now()
WHERE name IN (
  'DARUMA OFFWHITE — Premium Oversized 240 GSM Cotton T-Shirt Copy',
  'MARIACLARA ROCKSTAR — Premium Regular Fit 240 GSM Cotton T-Shirt Copy'
);

UPDATE products
SET description = regexp_replace(
      regexp_replace(description, 'black color', 'off-white color', 'gi'),
      'Color:\s*Black', 'Color: Off-white', 'gi'
    ),
    product_page = CASE
      WHEN product_page IS NULL THEN product_page
      ELSE jsonb_set(
        jsonb_set(
          product_page,
          '{intro}',
          to_jsonb(regexp_replace(
            regexp_replace(COALESCE(product_page->>'intro', ''), 'black color', 'off-white color', 'gi'),
            'Color:\s*Black', 'Color: Off-white', 'gi'
          )),
          true
        ),
        '{detailsText}',
        to_jsonb(regexp_replace(
          regexp_replace(COALESCE(product_page->>'detailsText', ''), 'black color', 'off-white color', 'gi'),
          'Color:\s*Black', 'Color: Off-white', 'gi'
        )),
        true
      )
    END,
    updated_at = now()
WHERE name ILIKE 'CURIOSITY OFFWHITE%';
