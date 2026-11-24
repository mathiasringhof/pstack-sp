const { withRetry } = require("./retry");

async function placeOrder(provider, order) {
  return withRetry(() => provider.charge({ amount: order.total, currency: order.currency, reference: order.id }));
}

async function refundOrder(provider, order) {
  return withRetry(() => provider.refund({ reference: order.id }), { retryOn: () => true });
}

module.exports = { placeOrder, refundOrder };
