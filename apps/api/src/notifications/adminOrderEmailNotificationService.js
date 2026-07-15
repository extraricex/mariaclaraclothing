const { env } = require('../config/env');
const { hasDatabaseUrl, transaction } = require('../db/postgres');
const {
  findOrderByNumber,
  updateOrderAdminEmailState
} = require('../orders/orderRepository');
const defaultRepository = require('./orderNotificationOutboxRepository');
const { sendAdminNewOrderEmail } = require('./adminOrderEmail');

const ADMIN_NEW_ORDER_EVENT = 'admin_new_order';

function safeAdminOrderEmailError(error) {
  const code = String(error?.code || '').toUpperCase();
  const responseCode = Number(error?.responseCode || 0);
  if (code === 'SMTP_NOT_CONFIGURED') return 'Admin order email is not configured.';
  if (code === 'EAUTH' || responseCode === 535) return 'SMTP authentication failed.';
  if (['ECONNECTION', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ESOCKET', 'EDNS'].includes(code)) {
    return 'SMTP connection failed.';
  }
  if (code === 'EENVELOPE' || responseCode >= 500) return 'SMTP delivery was rejected.';
  if (/order total is invalid/i.test(String(error?.message || ''))) return 'Order total is invalid for notification.';
  if (/order number is required/i.test(String(error?.message || ''))) return 'Order number is invalid for notification.';
  return 'Order email delivery failed.';
}

function isEligibleForAdminOrderEmail(order) {
  if (!order?.orderNumber) return false;
  const status = String(order.status || '').toLowerCase();
  const paymentStatus = String(order.paymentStatus || '').toLowerCase();
  if (['cancelled', 'failed', 'expired'].includes(status) || ['cancelled', 'failed', 'expired'].includes(paymentStatus)) return false;
  const isPayMongo = order.paymentMethod === 'paymongo' || order.paymentProvider === 'paymongo';
  return !isPayMongo || paymentStatus === 'paid';
}

function initialNotificationState(order, config) {
  const totalCents = Number(order?.totalCents);
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    return { status: 'failed', error: 'Order total is invalid for notification.' };
  }
  if (!config?.configured) {
    return { status: 'failed', error: 'Admin order email is not configured.' };
  }
  return { status: 'pending', error: '' };
}

async function enqueueAdminNewOrderEmail(order, {
  client,
  config = env.notifications.adminOrderEmail,
  repository = defaultRepository,
  updateOrderState = updateOrderAdminEmailState
} = {}) {
  if (!isEligibleForAdminOrderEmail(order) || order.adminEmailSentAt) return [];
  const state = initialNotificationState(order, config);
  const rows = await repository.enqueueMany(order.orderNumber, ADMIN_NEW_ORDER_EVENT, [{
    channel: 'email',
    recipient: config?.recipient || '',
    payload: { template: ADMIN_NEW_ORDER_EVENT },
    status: state.status
  }], { client });
  if (!rows.length) return [];
  await updateOrderState(order.orderNumber, state, { client });
  order.adminEmailStatus = state.status;
  order.adminEmailError = state.error;
  return rows;
}

async function finalizeSuccessfulAdminEmail(event, order, response, {
  client,
  repository = defaultRepository,
  updateOrderState = updateOrderAdminEmailState,
  now = () => new Date(),
  logger = console
} = {}) {
  const sentAt = now().toISOString();
  let outboxUpdated = false;
  let orderUpdated = false;
  try {
    await repository.markSent(client, event.id, response);
    outboxUpdated = true;
  } catch (_error) {
    logger.error('Admin order email status update failed.', {
      orderNumber: order.orderNumber,
      eventName: ADMIN_NEW_ORDER_EVENT,
      stage: 'outbox_sent'
    });
  }
  try {
    await updateOrderState(order.orderNumber, { status: 'sent', error: '', sentAt }, { client });
    orderUpdated = true;
  } catch (_error) {
    logger.error('Admin order email status update failed.', {
      orderNumber: order.orderNumber,
      eventName: ADMIN_NEW_ORDER_EVENT,
      stage: 'order_sent'
    });
  }
  if (!outboxUpdated && !orderUpdated) {
    const error = new Error('Order email was accepted, but its delivery status could not be saved.');
    error.code = 'EMAIL_STATUS_PERSIST_FAILED';
    error.emailAccepted = true;
    throw error;
  }
  return { sentAt, outboxUpdated, orderUpdated };
}

function safeLog(logger, level, message, orderNumber, status, error) {
  const method = typeof logger?.[level] === 'function' ? logger[level].bind(logger) : () => {};
  method(message, {
    orderNumber,
    eventName: ADMIN_NEW_ORDER_EVENT,
    status,
    code: String(error?.code || 'email_delivery_failed').slice(0, 80)
  });
}

async function resendAdminNewOrderEmail(orderNumber, {
  config = env.notifications.adminOrderEmail,
  repository = defaultRepository,
  findOrder = findOrderByNumber,
  updateOrderState = updateOrderAdminEmailState,
  sendEmail = sendAdminNewOrderEmail,
  transactionFn = hasDatabaseUrl() ? transaction : async (callback) => callback(undefined),
  logger = console,
  now = () => new Date()
} = {}) {
  const normalizedOrderNumber = String(orderNumber || '').trim();
  if (!config?.configured) {
    const error = new Error('Admin order email is not configured.');
    error.status = 503;
    error.code = 'smtp_not_configured';
    throw error;
  }

  const prepared = await transactionFn(async (client) => {
    const order = await findOrder(normalizedOrderNumber, {
      ...(client ? { client, forUpdate: true } : {}),
      includeRelated: false
    });
    if (!order) {
      const error = new Error('Order not found.');
      error.status = 404;
      error.code = 'order_not_found';
      throw error;
    }
    if (order.adminEmailSentAt) {
      const error = new Error('The admin order email was already sent.');
      error.status = 409;
      error.code = 'admin_email_already_sent';
      throw error;
    }
    const event = await repository.claimFailedForManualResend(client, {
      orderNumber: normalizedOrderNumber,
      eventName: ADMIN_NEW_ORDER_EVENT,
      channel: 'email'
    });
    if (!event) {
      const existing = (await repository.listForOrder(normalizedOrderNumber))
        .find((item) => item.eventName === ADMIN_NEW_ORDER_EVENT && item.channel === 'email');
      const error = new Error(existing?.status === 'sent'
        ? 'The admin order email was already sent.'
        : existing?.status === 'sending'
          ? 'The admin order email is already being sent.'
          : existing?.status === 'pending'
            ? 'The admin order email is already queued.'
            : 'There is no failed admin order email to resend.');
      error.status = 409;
      error.code = `admin_email_${existing?.status || 'not_failed'}`;
      throw error;
    }
    await updateOrderState(normalizedOrderNumber, { status: 'sending', error: '' }, { client });
    return { event, order };
  });

  let response;
  try {
    response = await sendEmail(prepared.order, { config });
  } catch (error) {
    const safeError = safeAdminOrderEmailError(error);
    try {
      await repository.markFailed(undefined, prepared.event.id, safeError);
    } catch (_stateError) {
      safeLog(logger, 'error', 'Admin order email failure status could not be saved.', normalizedOrderNumber, 'status_update_failed');
    }
    try {
      await updateOrderState(normalizedOrderNumber, { status: 'failed', error: safeError });
    } catch (_stateError) {
      safeLog(logger, 'error', 'Admin order email failure status could not be saved.', normalizedOrderNumber, 'status_update_failed');
    }
    safeLog(logger, 'error', 'Admin order email resend failed.', normalizedOrderNumber, 'failed', error);
    const publicError = new Error('The order email could not be sent. Check the email configuration and try again.');
    publicError.status = 502;
    publicError.code = 'admin_email_send_failed';
    publicError.details = { adminEmailStatus: 'failed', adminEmailError: safeError };
    throw publicError;
  }

  await finalizeSuccessfulAdminEmail(prepared.event, prepared.order, response, {
    repository, updateOrderState, now, logger
  });
  safeLog(logger, 'info', 'Admin order email sent.', normalizedOrderNumber, 'sent');
  return {
    order: await findOrder(normalizedOrderNumber),
    notification: (await repository.listForOrder(normalizedOrderNumber))
      .find((item) => item.eventName === ADMIN_NEW_ORDER_EVENT && item.channel === 'email')
  };
}

module.exports = {
  ADMIN_NEW_ORDER_EVENT,
  enqueueAdminNewOrderEmail,
  finalizeSuccessfulAdminEmail,
  initialNotificationState,
  isEligibleForAdminOrderEmail,
  resendAdminNewOrderEmail,
  safeAdminOrderEmailError,
  safeLog
};
