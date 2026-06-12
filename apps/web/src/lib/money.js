const pesoFormat = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  currencyDisplay: 'narrowSymbol'
});

export function formatMoney(cents) {
  return `${pesoFormat.format(Number(cents || 0) / 100)} PHP`;
}

export function formatPeso(cents) {
  return pesoFormat.format(Number(cents || 0) / 100);
}

export function pesoToCents(value) {
  const peso = Number(String(value).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(peso)) return null;
  return Math.round(peso * 100);
}

export function centsToPesoInput(cents) {
  if (cents === null || cents === undefined || cents === '') return '';
  return (Number(cents) / 100).toFixed(2);
}
