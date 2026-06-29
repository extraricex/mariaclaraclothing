const { normalizePhilippinePhone } = require('./jntExport');

function buildJntParcelDraft(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  const weightGrams = Number(order.parcelWeightOverrideGrams || order.parcelWeightGrams || 0);
  const isCod = order.paymentMethod === 'cash_on_delivery' && order.paymentStatus !== 'paid';
  return {
    orderNumber: String(order.orderNumber || ''),
    receiver: { name: String(order.customer?.fullName || '').trim(), phone: normalizePhilippinePhone(order.customer?.phone) },
    address: {
      detail: String(order.address?.houseAddress || order.address?.addressLine || '').trim(),
      barangay: String(order.address?.barangay || '').trim(), city: String(order.address?.city || '').trim(),
      province: String(order.address?.province || '').trim(), country: String(order.address?.country || 'Philippines').trim()
    },
    itemDescription: items.map((item) => `${item.productName || 'Item'}${item.size ? ` (${item.size})` : ''} x${Number(item.quantity || 0)}`).join(', '),
    quantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    weightGrams, weightKg: Number((weightGrams / 1000).toFixed(3)), parcelCount: Number(order.parcelCount || 1),
    codAmountCents: isCod ? Number(order.totalCents || 0) : 0
  };
}

function validateJntParcelDraft(draft) {
  const missing = [];
  if (!draft.receiver.name) missing.push('customer name');
  if (!draft.receiver.phone) missing.push('valid phone number');
  if (!draft.address.detail) missing.push('detailed address');
  if (!draft.address.province) missing.push('province');
  if (!draft.address.city) missing.push('city');
  if (!draft.address.barangay) missing.push('barangay');
  if (!draft.itemDescription || draft.quantity < 1) missing.push('parcel items');
  if (!Number.isFinite(draft.weightGrams) || draft.weightGrams < 1) missing.push('parcel weight');
  return missing;
}

function previewJntParcel(order, { mode = process.env.JNT_INTEGRATION_MODE || 'dry_run' } = {}) {
  if (mode !== 'dry_run') {
    const error = new Error('J&T Philippines live API is not configured. Request official VIP API access and specifications first.');
    error.status = 503; error.code = 'jnt_api_unavailable'; throw error;
  }
  const parcel = buildJntParcelDraft(order);
  const missingFields = validateJntParcelDraft(parcel);
  return { mode: 'dry_run', ready: missingFields.length === 0, missingFields, parcel };
}

module.exports = { buildJntParcelDraft, previewJntParcel, validateJntParcelDraft };
