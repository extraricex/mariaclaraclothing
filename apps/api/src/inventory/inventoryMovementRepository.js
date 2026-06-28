const fs = require('node:fs/promises');
const path = require('node:path');
const { hasDatabaseUrl, query, transaction } = require('../db/postgres');

const DEFAULT_MOVEMENTS_FILE = path.join(__dirname, '..', '..', 'data', 'inventory-movements.json');
const VALID_REASONS = new Set(['order_created', 'order_cancelled', 'admin_stock_correction']);
const REASON_ORDER = ['order_created', 'order_cancelled', 'admin_stock_correction'];
const VALID_SORTS = new Set(['newest', 'oldest']);
const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

function movementsDataFile() {
  return process.env.INVENTORY_MOVEMENTS_DATA_FILE || DEFAULT_MOVEMENTS_FILE;
}

function usePostgresMovements() {
  return hasDatabaseUrl() && !process.env.INVENTORY_MOVEMENTS_DATA_FILE;
}

async function readMovementStore() {
  try {
    const raw = await fs.readFile(movementsDataFile(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      movements: Array.isArray(parsed.movements) ? parsed.movements : []
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { movements: [] };
    throw error;
  }
}

async function writeMovementStore(store) {
  const filePath = movementsDataFile();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ movements: store.movements || [] }, null, 2)}\n`);
}

async function appendInventoryMovements(movements, options = {}) {
  const normalized = (Array.isArray(movements) ? movements : [movements]).map(normalizeMovement);
  if (!normalized.length) return [];

  if (usePostgresMovements()) {
    const executor = options.client || { query };
    for (const movement of normalized) {
      await executor.query(
        `INSERT INTO inventory_movements (
          id, order_number, source, reason, product_slug, product_name, sku,
          size, quantity_change, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          movement.id,
          movement.orderNumber,
          movement.source,
          movement.reason,
          movement.productSlug,
          movement.productName,
          movement.sku,
          movement.size,
          movement.quantityChange,
          movement.createdAt
        ]
      );
    }
    return normalized;
  }

  const store = await readMovementStore();
  store.movements.push(...normalized);
  await writeMovementStore(store);
  return normalized;
}

async function listInventoryMovements(filters = {}) {
  if (usePostgresMovements()) {
    const clauses = [];
    const values = [];
    if (filters.orderNumber) {
      values.push(String(filters.orderNumber));
      clauses.push(`order_number = $${values.length}`);
    }
    if (filters.sku) {
      values.push(String(filters.sku));
      clauses.push(`sku = $${values.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await query(`SELECT * FROM inventory_movements ${where} ORDER BY created_at DESC, id DESC`, values);
    return result.rows.map(fromPostgresMovement);
  }

  const store = await readMovementStore();
  return store.movements
    .filter((movement) => !filters.orderNumber || movement.orderNumber === filters.orderNumber)
    .filter((movement) => !filters.sku || movement.sku === filters.sku)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

async function queryInventoryMovements(filters = {}, options = {}) {
  const normalized = normalizeInventoryMovementQuery(filters, options);

  if (usePostgresMovements()) {
    return queryPostgresInventoryMovements(normalized);
  }

  const store = await readMovementStore();
  const filtered = store.movements.filter((movement) => movementMatchesQuery(movement, normalized));
  filtered.sort(movementComparator(normalized.sort));

  const totalItems = filtered.length;
  const movements = normalized.paginate
    ? filtered.slice((normalized.page - 1) * normalized.pageSize, normalized.page * normalized.pageSize)
    : filtered;

  return buildQueryResult(
    movements,
    summarizeMovements(filtered),
    buildDailySeries(filtered, normalized),
    buildReasonBreakdown(filtered),
    normalized,
    totalItems
  );
}

function normalizeInventoryMovementQuery(filters = {}, { paginate = true, now = new Date() } = {}) {
  const reason = String(filters.reason || '').trim();
  const sort = String(filters.sort || 'newest').trim();

  if (reason && !VALID_REASONS.has(reason)) {
    throw badRequest('reason must be order_created, order_cancelled, or admin_stock_correction');
  }
  if (!VALID_SORTS.has(sort)) {
    throw badRequest('sort must be newest or oldest');
  }

  const page = paginate ? parseIntegerFilter(filters.page, 1, 'page', 1) : 1;
  const pageSize = paginate ? parseIntegerFilter(filters.pageSize, 25, 'pageSize', 1, 100) : 25;
  let dateFrom = parseDateFilter(filters.dateFrom, 'dateFrom', false);
  let dateTo = parseDateFilter(filters.dateTo, 'dateTo', true);

  if (Boolean(dateFrom) !== Boolean(dateTo)) {
    throw badRequest('dateFrom and dateTo must be provided together');
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw badRequest('dateFrom must be on or before dateTo');
  }

  let range = 'custom';
  if (!dateFrom) {
    range = String(filters.range || '30d').trim();
    if (!Object.hasOwn(RANGE_DAYS, range)) {
      throw badRequest('range must be 7d, 30d, or 90d');
    }
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw badRequest('now must be a valid Date');
    }
    const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - (RANGE_DAYS[range] - 1));
    dateFrom = `${utcDateKey(startDate)}T00:00:00.000Z`;
    dateTo = `${utcDateKey(endDate)}T23:59:59.999Z`;
  }

  return {
    q: String(filters.q || '').trim(),
    reason,
    sort,
    page,
    pageSize,
    range,
    dateFrom,
    dateTo,
    paginate: Boolean(paginate)
  };
}

async function queryPostgresInventoryMovements(normalized, runTransaction = transaction) {
  const queries = buildPostgresInventoryMovementQueries(normalized);
  const { aggregateResult, recordsResult, dailyResult, reasonsResult } = await runTransaction(async (client) => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    return {
      aggregateResult: await client.query(queries.aggregate.text, queries.aggregate.values),
      recordsResult: await client.query(queries.records.text, queries.records.values),
      dailyResult: await client.query(queries.daily.text, queries.daily.values),
      reasonsResult: await client.query(queries.reasons.text, queries.reasons.values)
    };
  });
  const aggregate = aggregateResult.rows[0] || {};
  const totalItems = Number(aggregate.total_movements || 0);
  const summary = {
    totalMovements: totalItems,
    stockAdded: Number(aggregate.stock_added || 0),
    stockRemoved: Number(aggregate.stock_removed || 0),
    netChange: Number(aggregate.net_change || 0)
  };

  return buildQueryResult(
    recordsResult.rows.map(fromPostgresMovement),
    summary,
    fillDailySeries(dailyResult.rows, normalized),
    fillReasonBreakdown(reasonsResult.rows),
    normalized,
    totalItems
  );
}

function buildPostgresInventoryMovementQueries(normalized) {
  const { where, values } = postgresQueryConditions(normalized);
  const direction = normalized.sort === 'oldest' ? 'ASC' : 'DESC';
  const aggregate = {
    text: `SELECT
      COUNT(*)::integer AS total_movements,
      COALESCE(SUM(CASE WHEN quantity_change > 0 THEN quantity_change ELSE 0 END), 0) AS stock_added,
      COALESCE(SUM(CASE WHEN quantity_change < 0 THEN -quantity_change ELSE 0 END), 0) AS stock_removed,
      COALESCE(SUM(quantity_change), 0) AS net_change
    FROM inventory_movements ${where}`,
    values: [...values]
  };

  const dataValues = [...values];
  let paginationSql = '';
  if (normalized.paginate) {
    dataValues.push(normalized.pageSize, (normalized.page - 1) * normalized.pageSize);
    paginationSql = `LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`;
  }
  const records = {
    text: `SELECT * FROM inventory_movements ${where}
     ORDER BY created_at ${direction}, id ${direction} ${paginationSql}`,
    values: dataValues
  };

  const daily = {
    text: `SELECT
      TO_CHAR(DATE_TRUNC('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
      COALESCE(SUM(CASE WHEN quantity_change > 0 THEN quantity_change ELSE 0 END), 0) AS stock_added,
      COALESCE(SUM(CASE WHEN quantity_change < 0 THEN -quantity_change ELSE 0 END), 0) AS stock_removed,
      COALESCE(SUM(quantity_change), 0) AS net_change
    FROM inventory_movements ${where}
    GROUP BY DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')
    ORDER BY DATE_TRUNC('day', created_at AT TIME ZONE 'UTC') ASC`,
    values: [...values]
  };
  const reasons = {
    text: `SELECT reason,
      COUNT(*)::integer AS movement_count,
      COALESCE(SUM(ABS(quantity_change)), 0) AS quantity_magnitude
    FROM inventory_movements ${where}
    GROUP BY reason`,
    values: [...values]
  };

  return { aggregate, records, daily, reasons };
}

function postgresQueryConditions(normalized) {
  const clauses = [];
  const values = [];
  if (normalized.q) {
    values.push(`%${escapePostgresLike(normalized.q)}%`);
    const parameter = `$${values.length}`;
    const searchColumns = ['product_name', 'product_slug', 'sku', 'order_number'];
    clauses.push(`(${searchColumns.map((column) => `${column} ILIKE ${parameter} ESCAPE E'\\\\'`).join(' OR ')})`);
  }
  if (normalized.reason) {
    values.push(normalized.reason);
    clauses.push(`reason = $${values.length}`);
  }
  if (normalized.dateFrom) {
    values.push(normalized.dateFrom);
    clauses.push(`created_at >= $${values.length}`);
  }
  if (normalized.dateTo) {
    values.push(normalized.dateTo);
    clauses.push(`created_at <= $${values.length}`);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
}

function escapePostgresLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

function movementMatchesQuery(movement, normalized) {
  const searchable = [movement.productName, movement.productSlug, movement.sku, movement.orderNumber]
    .map((value) => String(value || '').toLowerCase());
  const createdAt = String(movement.createdAt || '');
  return (!normalized.q || searchable.some((value) => value.includes(normalized.q.toLowerCase())))
    && (!normalized.reason || movement.reason === normalized.reason)
    && (!normalized.dateFrom || createdAt >= normalized.dateFrom)
    && (!normalized.dateTo || createdAt <= normalized.dateTo);
}

function movementComparator(sort) {
  const direction = sort === 'oldest' ? 1 : -1;
  return (left, right) => {
    const dateComparison = String(left.createdAt || '').localeCompare(String(right.createdAt || ''));
    if (dateComparison) return dateComparison * direction;
    return String(left.id || '').localeCompare(String(right.id || '')) * direction;
  };
}

function summarizeMovements(movements) {
  return movements.reduce((summary, movement) => {
    const change = Number(movement.quantityChange || 0);
    summary.totalMovements += 1;
    summary.stockAdded += change > 0 ? change : 0;
    summary.stockRemoved += change < 0 ? Math.abs(change) : 0;
    summary.netChange += change;
    return summary;
  }, { totalMovements: 0, stockAdded: 0, stockRemoved: 0, netChange: 0 });
}

function buildDailySeries(movements, normalized) {
  const rows = new Map();
  for (const movement of movements) {
    const date = String(movement.createdAt || '').slice(0, 10);
    const row = rows.get(date) || { date, stockAdded: 0, stockRemoved: 0, netChange: 0 };
    const change = Number(movement.quantityChange || 0);
    row.stockAdded += change > 0 ? change : 0;
    row.stockRemoved += change < 0 ? Math.abs(change) : 0;
    row.netChange += change;
    rows.set(date, row);
  }
  return fillDailySeries([...rows.values()], normalized);
}

function fillDailySeries(rows, normalized) {
  const byDate = new Map(rows.map((row) => [postgresDateKey(row.date), {
    date: postgresDateKey(row.date),
    stockAdded: Number(row.stockAdded ?? row.stock_added ?? 0),
    stockRemoved: Number(row.stockRemoved ?? row.stock_removed ?? 0),
    netChange: Number(row.netChange ?? row.net_change ?? 0)
  }]));
  const series = [];
  const cursor = new Date(normalized.dateFrom);
  const end = new Date(normalized.dateTo);
  while (cursor <= end) {
    const date = utcDateKey(cursor);
    series.push(byDate.get(date) || { date, stockAdded: 0, stockRemoved: 0, netChange: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return series;
}

function buildReasonBreakdown(movements) {
  const rows = new Map();
  for (const movement of movements) {
    const row = rows.get(movement.reason) || { reason: movement.reason, movementCount: 0, quantityMagnitude: 0 };
    row.movementCount += 1;
    row.quantityMagnitude += Math.abs(Number(movement.quantityChange || 0));
    rows.set(movement.reason, row);
  }
  return fillReasonBreakdown([...rows.values()]);
}

function fillReasonBreakdown(rows) {
  const byReason = new Map(rows.map((row) => [row.reason, {
    reason: row.reason,
    movementCount: Number(row.movementCount ?? row.movement_count ?? 0),
    quantityMagnitude: Number(row.quantityMagnitude ?? row.quantity_magnitude ?? 0)
  }]));
  return REASON_ORDER.map((reason) => byReason.get(reason) || { reason, movementCount: 0, quantityMagnitude: 0 });
}

function utcDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function postgresDateKey(value) {
  if (value instanceof Date) return utcDateKey(value);
  return String(value || '').slice(0, 10);
}

function buildQueryResult(movements, summary, dailySeries, reasonBreakdown, normalized, totalItems) {
  return {
    movements,
    summary,
    dailySeries,
    reasonBreakdown,
    pagination: {
      page: normalized.page,
      pageSize: normalized.pageSize,
      totalItems,
      totalPages: normalized.paginate ? Math.ceil(totalItems / normalized.pageSize) : (totalItems ? 1 : 0)
    }
  };
}

function parseIntegerFilter(value, defaultValue, name, minimum, maximum) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'string' && !/^\d+$/.test(value)) {
    throw integerFilterError(name, minimum, maximum);
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw integerFilterError(name, minimum, maximum);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || (maximum && parsed > maximum)) {
    throw integerFilterError(name, minimum, maximum);
  }
  return parsed;
}

function integerFilterError(name, minimum, maximum) {
  const range = maximum ? ` between ${minimum} and ${maximum}` : ` at least ${minimum}`;
  return badRequest(`${name} must be an integer${range}`);
}

function parseDateFilter(value, name, endOfDay) {
  if (value === undefined || value === null || value === '') return '';
  const input = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw badRequest(`${name} must be a valid YYYY-MM-DD date`);
  }
  const [year, month, day] = input.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw badRequest(`${name} must be a valid YYYY-MM-DD date`);
  }
  return `${input}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`;
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

async function resetInventoryMovementRepositoryForTests() {
  if (usePostgresMovements()) {
    await query('DELETE FROM inventory_movements');
    return;
  }
  await writeMovementStore({ movements: [] });
}

function normalizeMovement(movement) {
  const createdAt = movement.createdAt || new Date().toISOString();
  return {
    id: movement.id || `inventory-movement-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    orderNumber: String(movement.orderNumber || '').trim(),
    source: String(movement.source || 'order').trim(),
    reason: String(movement.reason || 'order_created').trim(),
    productSlug: String(movement.productSlug || '').trim(),
    productName: String(movement.productName || '').trim(),
    sku: String(movement.sku || '').trim(),
    size: String(movement.size || '').trim(),
    quantityChange: Number(movement.quantityChange || 0),
    createdAt
  };
}

function fromPostgresMovement(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    source: row.source,
    reason: row.reason,
    productSlug: row.product_slug,
    productName: row.product_name,
    sku: row.sku,
    size: row.size,
    quantityChange: row.quantity_change,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : ''
  };
}

module.exports = {
  appendInventoryMovements,
  buildPostgresInventoryMovementQueries,
  listInventoryMovements,
  normalizeInventoryMovementQuery,
  queryPostgresInventoryMovements,
  queryInventoryMovements,
  resetInventoryMovementRepositoryForTests
};
