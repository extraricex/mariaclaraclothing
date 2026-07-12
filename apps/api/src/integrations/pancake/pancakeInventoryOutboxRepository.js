const crypto = require('node:crypto');
const { hasDatabaseUrl, query, transaction } = require('../../db/postgres');

const memory = new Map();
const memoryLogs = [];

function checksum(rows) {
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

async function inventorySnapshot(productSlug, executor) {
  const result = await executor.query(
    `SELECT sku,stock_quantity FROM product_variants
      WHERE product_slug=$1 ORDER BY upper(sku),id`,
    [productSlug]
  );
  return result.rows.map((row) => ({ sku: row.sku, quantity: Number(row.stock_quantity || 0) }));
}

async function enqueueInventorySync(productSlugs, source = 'admin', options = {}) {
  const slugs = [...new Set((productSlugs || []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (!slugs.length) return [];
  if (!hasDatabaseUrl()) {
    return slugs.map((productSlug) => {
      const record = { productSlug, source, status: 'pending', desiredQuantities: [], checksum: crypto.randomUUID(), attemptCount: 0 };
      memory.set(productSlug, record);
      return record;
    });
  }
  const executor = options.client || { query };
  const records = [];
  for (const productSlug of slugs) {
    const desired = await inventorySnapshot(productSlug, executor);
    const digest = checksum(desired);
    const result = await executor.query(
      `INSERT INTO pancake_inventory_outbox (
         product_slug,source,status,desired_quantities,checksum,attempt_count,max_attempts,
         next_attempt_at,last_error_code,created_at,updated_at
       ) VALUES ($1,$2,'pending',$3::jsonb,$4,0,$5,now(),'',now(),now())
       ON CONFLICT (product_slug) DO UPDATE SET
         source=EXCLUDED.source,status='pending',desired_quantities=EXCLUDED.desired_quantities,
         checksum=EXCLUDED.checksum,attempt_count=0,max_attempts=EXCLUDED.max_attempts,
         next_attempt_at=now(),last_error_code='',updated_at=now()
       RETURNING *`,
      [productSlug, source, JSON.stringify(desired), digest, Number(options.maxAttempts || 10)]
    );
    records.push(fromJob(result.rows[0]));
  }
  return records;
}

async function claimDueInventoryJobs({ limit = 20, productSlugs = [] } = {}) {
  if (!hasDatabaseUrl()) {
    const allowed = new Set(productSlugs);
    const jobs = [...memory.values()]
      .filter((job) => ['pending', 'failed'].includes(job.status) && (!allowed.size || allowed.has(job.productSlug)))
      .slice(0, limit)
      .map((job) => ({ ...job, status: 'processing', attemptCount: Number(job.attemptCount || 0) + 1 }));
    for (const job of jobs) memory.set(job.productSlug, job);
    return jobs;
  }
  const slugs = [...new Set(productSlugs.map((value) => String(value || '').trim()).filter(Boolean))];
  return transaction(async (client) => {
    const result = await client.query(
      `WITH due AS (
         SELECT product_slug FROM pancake_inventory_outbox
          WHERE status IN ('pending','failed') AND next_attempt_at<=now() AND attempt_count<max_attempts
            AND (cardinality($2::text[])=0 OR product_slug=ANY($2::text[]))
          ORDER BY next_attempt_at,updated_at LIMIT $1 FOR UPDATE SKIP LOCKED
       )
       UPDATE pancake_inventory_outbox o SET status='processing',attempt_count=o.attempt_count+1,
         last_attempt_at=now(),updated_at=now()
       FROM due WHERE o.product_slug=due.product_slug RETURNING o.*`,
      [limit, slugs]
    );
    return result.rows.map(fromJob);
  });
}

async function markInventoryJobSynced(job, sync) {
  const now = new Date().toISOString();
  if (!hasDatabaseUrl()) {
    memory.set(job.productSlug, { ...job, status: 'synced', lastSyncedAt: now, lastErrorCode: '' });
    return;
  }
  await transaction(async (client) => {
    await client.query(
      `UPDATE pancake_inventory_outbox SET status='synced',last_synced_at=$2,last_error_code='',updated_at=$2
        WHERE product_slug=$1 AND checksum=$3`,
      [job.productSlug, now, job.checksum]
    );
    for (const mapping of sync?.variantMappings || []) {
      await client.query(
        `INSERT INTO pancake_inventory_state (
           local_variant_id,product_slug,sku,pancake_product_id,pancake_variation_id,
           website_quantity,pancake_quantity,status,last_source,last_synced_at,updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$6,'matched',$7,$8,$8)
         ON CONFLICT (local_variant_id) DO UPDATE SET
           product_slug=EXCLUDED.product_slug,sku=EXCLUDED.sku,pancake_product_id=EXCLUDED.pancake_product_id,
           pancake_variation_id=EXCLUDED.pancake_variation_id,website_quantity=EXCLUDED.website_quantity,
           pancake_quantity=EXCLUDED.pancake_quantity,status='matched',last_source=EXCLUDED.last_source,
           last_synced_at=EXCLUDED.last_synced_at,updated_at=EXCLUDED.updated_at`,
        [mapping.localVariantId, job.productSlug, mapping.sku, mapping.pancakeProductId || sync.pancakeProductId || '',
          mapping.pancakeVariantId, Number(mapping.stockQuantity || 0), job.source, now]
      );
      await insertLog(client, {
        productSlug: job.productSlug, sku: mapping.sku, direction: 'outbound', source: job.source,
        status: 'synced', websiteQuantity: mapping.stockQuantity, pancakeQuantity: mapping.stockQuantity,
        attemptCount: job.attemptCount, message: 'Website stock synchronized to Pancake POS.'
      });
    }
  });
}

function retryDelayMs(attempt) {
  return [60_000, 5 * 60_000, 15 * 60_000][Math.min(Math.max(Number(attempt || 1) - 1, 0), 2)];
}

async function markInventoryJobFailed(job, code) {
  const nextAttemptAt = new Date(Date.now() + retryDelayMs(job.attemptCount)).toISOString();
  if (!hasDatabaseUrl()) {
    memory.set(job.productSlug, { ...job, status: 'failed', lastErrorCode: code, nextAttemptAt });
    return;
  }
  await transaction(async (client) => {
    await client.query(
      `UPDATE pancake_inventory_outbox SET status='failed',last_error_code=$2,next_attempt_at=$3,updated_at=now()
        WHERE product_slug=$1 AND checksum=$4`,
      [job.productSlug, code, nextAttemptAt, job.checksum]
    );
    await insertLog(client, {
      productSlug: job.productSlug, direction: 'outbound', source: job.source, status: 'failed',
      attemptCount: job.attemptCount, safeErrorCode: code,
      message: 'Pancake inventory sync failed and was scheduled for automatic retry.'
    });
  });
}

async function insertLog(executor, record) {
  const normalized = { id: crypto.randomUUID(), ...record };
  if (!hasDatabaseUrl()) { memoryLogs.unshift(normalized); return; }
  await executor.query(
    `INSERT INTO pancake_inventory_sync_logs (
       id,product_slug,sku,direction,source,status,website_quantity,pancake_quantity,
       attempt_count,safe_error_code,message,metadata,created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,now())`,
    [normalized.id, normalized.productSlug || '', normalized.sku || '', normalized.direction,
      normalized.source || '', normalized.status || '', normalized.websiteQuantity ?? null,
      normalized.pancakeQuantity ?? null, Number(normalized.attemptCount || 0), normalized.safeErrorCode || '',
      normalized.message || '', JSON.stringify(normalized.metadata || {})]
  );
}

async function listInventorySyncDashboard({ limit = 100 } = {}) {
  if (!hasDatabaseUrl()) return { variants: [], jobs: [...memory.values()], logs: memoryLogs.slice(0, limit) };
  const [variants, jobs, logs] = await Promise.all([
    query(`SELECT v.id AS local_variant_id,v.product_slug,p.name AS product_name,v.sku,v.size,
      v.stock_quantity AS website_quantity,m.pancake_product_id,m.pancake_variation_id,m.status AS mapping_status,
      s.pancake_quantity,s.status AS sync_status,s.last_source,s.last_synced_at,
      o.status AS job_status,o.last_error_code,o.attempt_count,o.next_attempt_at
      FROM product_variants v JOIN products p ON p.slug=v.product_slug
      LEFT JOIN pancake_variant_mappings m ON m.local_variant_id=v.id
      LEFT JOIN pancake_inventory_state s ON s.local_variant_id=v.id
      LEFT JOIN pancake_inventory_outbox o ON o.product_slug=v.product_slug
      ORDER BY p.name,v.id`),
    query('SELECT * FROM pancake_inventory_outbox ORDER BY updated_at DESC'),
    query('SELECT * FROM pancake_inventory_sync_logs ORDER BY created_at DESC LIMIT $1', [Math.min(Math.max(Number(limit || 100), 1), 500)])
  ]);
  return { variants: variants.rows, jobs: jobs.rows.map(fromJob), logs: logs.rows };
}

function fromJob(row = {}) {
  return {
    productSlug: row.product_slug || row.productSlug || '', source: row.source || '', status: row.status || '',
    desiredQuantities: row.desired_quantities || row.desiredQuantities || [], checksum: row.checksum || '',
    attemptCount: Number(row.attempt_count ?? row.attemptCount ?? 0), maxAttempts: Number(row.max_attempts ?? row.maxAttempts ?? 10),
    nextAttemptAt: row.next_attempt_at || row.nextAttemptAt || '', lastAttemptAt: row.last_attempt_at || '',
    lastSyncedAt: row.last_synced_at || '', lastErrorCode: row.last_error_code || ''
  };
}

module.exports = {
  claimDueInventoryJobs, enqueueInventorySync, insertLog, listInventorySyncDashboard,
  markInventoryJobFailed, markInventoryJobSynced, retryDelayMs
};
