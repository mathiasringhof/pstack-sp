const { test } = require("node:test");
const assert = require("node:assert");
const { placeOrder } = require("../src/client");

test("placeOrder charges the order total once", async () => {
  const calls = [];
  const provider = { charge: async (request) => (calls.push(request), { ok: true }) };
  await placeOrder(provider, { id: "o-1", total: 1200, currency: "EUR" });
  assert.deepStrictEqual(calls, [{ amount: 1200, currency: "EUR", reference: "o-1" }]);
});

test("placeOrder gives up at once on a declined card", async () => {
  let attempts = 0;
  const provider = { charge: async () => (attempts++, Promise.reject(Object.assign(new Error("declined"), { status: 402 }))) };
  await assert.rejects(placeOrder(provider, { id: "o-2", total: 500, currency: "EUR" }), /declined/);
  assert.strictEqual(attempts, 1);
});
