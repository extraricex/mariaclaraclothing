const path = require('node:path');
const XLSX = require('xlsx');

const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'data', 'jnt', 'jntexportfile.xlsx');
const LIST_SHEET = 'List';
const HEADER_ROW = 8;
const FIRST_DATA_ROW = 9;
const LAST_COLUMN_INDEX = 12;
const DEFAULT_EXPRESS_TYPE = process.env.JNT_DEFAULT_EXPRESS_TYPE || 'EZ';

function buildJntExportWorkbook(orders = []) {
  const workbook = XLSX.readFile(TEMPLATE_PATH, { cellStyles: true });
  const sheet = workbook.Sheets[LIST_SHEET];
  const rows = orders.map(orderToJntRow);
  const templateStyles = readTemplateRowStyles(sheet);

  clearListDataRows(sheet);
  XLSX.utils.sheet_add_aoa(sheet, rows, { origin: `A${FIRST_DATA_ROW}` });
  applyTemplateRowStyle(sheet, rows.length, templateStyles);
  sheet['!ref'] = `A1:M${Math.max(HEADER_ROW, HEADER_ROW + rows.length)}`;

  return workbook;
}

function writeJntExportBuffer(orders = []) {
  return XLSX.write(buildJntExportWorkbook(orders), {
    bookType: 'xlsx',
    type: 'buffer'
  });
}

function validateJntOrders(orders = []) {
  return orders.map((order) => {
    const missing = [];
    const address = order.address || {};
    const customer = order.customer || {};

    if (!String(customer.fullName || '').trim()) missing.push('customer name');
    if (!normalizePhilippinePhone(customer.phone)) missing.push('valid phone number');
    if (!String(address.houseAddress || address.addressLine || '').trim()) missing.push('detailed address');
    if (!String(address.province || '').trim()) missing.push('province');
    if (!String(address.city || '').trim()) missing.push('city');
    if (!String(address.barangay || '').trim()) missing.push('barangay');
    if (!String(order.paymentMethod || '').trim()) missing.push('payment method');
    if (!Number.isFinite(Number(order.totalCents))) missing.push('order total');

    return {
      orderNumber: order.orderNumber,
      missing
    };
  }).filter((result) => result.missing.length);
}

function orderToJntRow(order) {
  const customer = order.customer || {};
  const address = order.address || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const total = pesoAmount(order.totalCents);
  const isCod = String(order.paymentMethod || '').toLowerCase() === 'cash_on_delivery';

  return [
    String(customer.fullName || '').trim(),
    normalizePhilippinePhone(customer.phone),
    uppercase(address.houseAddress || address.addressLine),
    uppercase(address.province),
    uppercase(address.city),
    uppercase(address.barangay),
    DEFAULT_EXPRESS_TYPE,
    items.map((item) => item.productName).filter(Boolean).join(', '),
    String(order.jntWeightKg || order.packageWeightKg || 1),
    String(order.jntParcelCount || order.parcelCount || 1),
    total,
    isCod ? total : '0',
    orderRemarks(order)
  ];
}

function normalizePhilippinePhone(phone) {
  const value = String(phone || '').replace(/[^\d+]/g, '');
  if (/^\+639\d{9}$/.test(value)) return value;
  if (/^09\d{9}$/.test(value)) return `+63${value.slice(1)}`;
  if (/^639\d{9}$/.test(value)) return `+${value}`;
  return '';
}

function orderRemarks(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const variants = items
    .map((item) => `${item.size || 'Item'} x${Number(item.quantity || 0)}`)
    .filter(Boolean)
    .join('; ');
  return [variants, order.notes].filter(Boolean).join(' | ');
}

function pesoAmount(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function uppercase(value) {
  return String(value || '').trim().toUpperCase();
}

function clearListDataRows(sheet) {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:M10');
  for (let row = FIRST_DATA_ROW - 1; row <= range.e.r; row += 1) {
    for (let column = 0; column <= LAST_COLUMN_INDEX; column += 1) {
      delete sheet[XLSX.utils.encode_cell({ r: row, c: column })];
    }
  }
}

function readTemplateRowStyles(sheet) {
  return Array.from({ length: LAST_COLUMN_INDEX + 1 }).map((_value, column) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: FIRST_DATA_ROW - 1, c: column })];
    return cell?.s ? { ...cell.s } : null;
  });
}

function applyTemplateRowStyle(sheet, rowCount, templateStyles) {
  for (let row = FIRST_DATA_ROW - 1; row < FIRST_DATA_ROW - 1 + rowCount; row += 1) {
    for (let column = 0; column <= LAST_COLUMN_INDEX; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell && templateStyles[column]) cell.s = { ...templateStyles[column] };
    }
  }
}

module.exports = {
  buildJntExportWorkbook,
  normalizePhilippinePhone,
  validateJntOrders,
  writeJntExportBuffer
};
