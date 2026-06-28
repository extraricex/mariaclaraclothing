const STORAGE_PREFIX = 'maria-clara-collection-countdown:';

export function countdownStorageKey(collectionName) {
  return `${STORAGE_PREFIX}${encodeURIComponent(String(collectionName || '').trim().toLowerCase())}`;
}

export function durationPartsToSeconds(hours, minutes, seconds) {
  const parts = [hours, minutes, seconds].map(Number);
  if (parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error('Countdown values must be non-negative whole numbers.');
  }
  const [h, m, s] = parts;
  if (h > 99 || m > 59 || s > 59) {
    throw new Error('Countdown cannot exceed 99:59:59.');
  }
  const total = h * 3600 + m * 60 + s;
  if (total < 1) {
    throw new Error('Countdown must be at least one second.');
  }
  return total;
}

export function formatRemainingTime(totalSeconds) {
  const total = Math.max(0, Math.min(359999, Math.ceil(Number(totalSeconds) || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

export function selectProductCountdown(product, settings) {
  const collectionName = Array.isArray(product?.collections) ? product.collections[0] : '';
  const config = settings?.collectionCountdowns?.[collectionName];
  if (!collectionName || !config?.enabled || !String(config.message || '').trim()) return null;
  if (!Number.isInteger(config.durationSeconds) || config.durationSeconds < 1 || config.durationSeconds > 359999) {
    return null;
  }
  if (!Number.isInteger(config.revision) || config.revision < 0) return null;
  return { collectionName, config };
}

export function resolveVisitorCountdown(collectionName, config, storage, nowMs = Date.now()) {
  const key = countdownStorageKey(collectionName);
  let stored = null;
  try {
    stored = JSON.parse(storage?.getItem(key) || 'null');
  } catch (_error) {
    stored = null;
  }

  let deadlineMs = Number(stored?.deadlineMs);
  if (stored?.revision !== config.revision || !Number.isFinite(deadlineMs)) {
    deadlineMs = nowMs + config.durationSeconds * 1000;
    try {
      storage?.setItem(key, JSON.stringify({ revision: config.revision, deadlineMs }));
    } catch (_error) {
      // Storage can be blocked by browser privacy settings; the in-memory deadline still works.
    }
  }

  if (deadlineMs <= nowMs) return null;
  return {
    deadlineMs,
    remainingSeconds: Math.ceil((deadlineMs - nowMs) / 1000)
  };
}
