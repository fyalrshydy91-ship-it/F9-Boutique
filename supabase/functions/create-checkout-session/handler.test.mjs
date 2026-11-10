import assert from "node:assert/strict";
import test from "node:test";
import { createCheckoutHandler } from "./handler.mjs";

const USER_ID = "a11a1111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "b22b2222-2222-4222-8222-222222222222";
const ORDER_ID = "c33c3333-3333-4333-8333-333333333333";
const SESSION_ID = "cs_test_checkout_session";
const PRICE_ID = "price_test_f9_one_dollar";

const environment = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "test-publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  STRIPE_SECRET_KEY: "sk_test_only_for_unit_tests",
  STRIPE_PRICE_ID: PRICE_ID,
  APP_BASE_URL: "https://boutique.example.test",
};

function request(body, authorization = "Bearer signed-in-test-token") {
  return new Request("https://edge.example.test/functions/v1/create-checkout-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

function fixture({
  orderOwner = USER_ID,
  paymentStatus = "unpaid",
  sessionId = null,
  sessionUserId = USER_ID,
  sessionPaid = true,
  amountTotal = 100,
} = {}) {
  const order = {
    id: ORDER_ID,
    user_id: orderOwner,
    order_number: "F9-TEST-ORDER",
    status: "Pending",
    currency: "KWD",
    payment_status: paymentStatus,
    stripe_checkout_session_id: sessionId,
    paid_at: null,
  };
  const calls = [];
  const stripeSession = {
    id: SESSION_ID,
    mode: "payment",
    status: "complete",
    payment_status: sessionPaid ? "paid" : "unpaid",
    currency: "usd",
    amount_total: amountTotal,
    client_reference_id: sessionUserId,
    metadata: {
      supabase_user_id: sessionUserId,
      order_id: ORDER_ID,
    },
  };

  async function fetchImpl(input, init = {}) {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ url, method, headers: new Headers(init.headers), body: init.body });

    if (url.hostname === "supabase.test" && url.pathname === "/auth/v1/user") {
      return Response.json({ id: USER_ID, email: "buyer@example.test" });
    }

    if (url.hostname === "supabase.test" && url.pathname === "/rest/v1/orders") {
      const matchesOwner = url.searchParams.get("user_id") === `eq.${USER_ID}`;
      const matchesOrder = url.searchParams.get("id") === `eq.${ORDER_ID}`;
      if (method === "GET") {
        return Response.json(matchesOwner && matchesOrder && order.user_id === USER_ID
          ? [structuredClone(order)]
          : []);
      }
      if (method === "PATCH") {
        const expectedSession = url.searchParams.get("stripe_checkout_session_id");
        const sessionMatches = expectedSession === "is.null"
          ? order.stripe_checkout_session_id === null
          : expectedSession === `eq.${order.stripe_checkout_session_id}`;
        const mayUpdate = matchesOwner && matchesOrder && order.user_id === USER_ID &&
          url.searchParams.get("status") === "eq.Pending" &&
          url.searchParams.get("payment_status") === `eq.${order.payment_status}` &&
          sessionMatches;
        if (!mayUpdate) return Response.json([]);
        Object.assign(order, JSON.parse(init.body));
        return Response.json([structuredClone(order)]);
      }
    }

    if (url.hostname === "api.stripe.com") {
      if (url.pathname === `/v1/prices/${PRICE_ID}`) {
        return Response.json({
          id: PRICE_ID,
          active: true,
          currency: "usd",
          unit_amount: 100,
          recurring: null,
        });
      }
      if (url.pathname === "/v1/checkout/sessions" && method === "POST") {
        return Response.json({
          id: SESSION_ID,
          url: "https://checkout.stripe.com/c/pay/cs_test_checkout_session",
          status: "open",
        });
      }
      if (url.pathname === `/v1/checkout/sessions/${SESSION_ID}`) {
        return Response.json(stripeSession);
      }
      if (url.pathname === `/v1/checkout/sessions/${SESSION_ID}/line_items`) {
        return Response.json({
          data: [{
            quantity: 1,
            price: { id: PRICE_ID, currency: "usd", unit_amount: 100 },
          }],
        });
      }
    }

    throw new Error(`Unexpected test request: ${method} ${url.pathname}`);
  }

  return {
    order,
    calls,
    handler: createCheckoutHandler({
      getEnv: (name) => environment[name],
      fetchImpl,
      now: () => new Date("2026-11-10T10:00:00.000Z"),
    }),
  };
}

test("requires a Supabase bearer session before calling any service", async () => {
  const { handler, calls } = fixture();
  const response = await handler(request({ action: "create", order_id: ORDER_ID }, null));

  assert.equal(response.status, 401);
  assert.deepEqual(calls, []);
});

test("creates only the fixed $1 USD test Checkout session and associates it with the owner order", async () => {
  const { handler, calls, order } = fixture();
  const response = await handler(request({ action: "create", order_id: ORDER_ID }));
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.checkout_url, "https://checkout.stripe.com/c/pay/cs_test_checkout_session");
  assert.equal(result.test_mode, true);
  assert.equal(result.test_amount, 100);
  assert.equal(result.test_currency, "usd");
  assert.equal(order.stripe_checkout_session_id, SESSION_ID);
  assert.equal(order.payment_status, "unpaid");
  assert.equal(order.status, "Pending");

  const createCall = calls.find((call) =>
    call.url.hostname === "api.stripe.com" &&
    call.url.pathname === "/v1/checkout/sessions" &&
    call.method === "POST");
  assert.ok(createCall);
  const form = new URLSearchParams(createCall.body);
  assert.equal(form.get("line_items[0][price]"), PRICE_ID);
  assert.equal(form.get("line_items[0][quantity]"), "1");
  assert.equal(form.get("client_reference_id"), USER_ID);
  assert.equal(form.get("metadata[supabase_user_id]"), USER_ID);
  assert.equal(form.get("metadata[order_id]"), ORDER_ID);
  assert.match(form.get("success_url"), /payment=success/);
  assert.match(form.get("success_url"), /session_id=\{CHECKOUT_SESSION_ID\}/);
  assert.match(form.get("cancel_url"), /payment=cancel/);
  assert.match(form.get("cancel_url"), new RegExp(`order_id=${ORDER_ID}`));
  assert.equal(createCall.headers.get("Idempotency-Key"), `f9-test-order-${ORDER_ID}-initial`);

  const responseText = JSON.stringify(result);
  assert.equal(responseText.includes(environment.STRIPE_SECRET_KEY), false);
  assert.equal(responseText.includes(environment.SUPABASE_SERVICE_ROLE_KEY), false);
});

test("cannot create a checkout for an order owned by another account", async () => {
  const { handler, calls } = fixture({ orderOwner: OTHER_USER_ID });
  const response = await handler(request({ action: "create", order_id: ORDER_ID }));

  assert.equal(response.status, 404);
  assert.equal(calls.some((call) => call.url.hostname === "api.stripe.com"), false);
});

test("marks an order paid only after Stripe confirms the matching completed session", async () => {
  const { handler, order } = fixture({ sessionId: SESSION_ID });
  const response = await handler(request({ action: "verify", session_id: SESSION_ID }));
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.paid, true);
  assert.equal(result.payment_status, "paid");
  assert.equal(order.payment_status, "paid");
  assert.equal(order.status, "Processing");
  assert.equal(order.paid_at, "2026-11-10T10:00:00.000Z");

  const repeatedResponse = await handler(request({ action: "verify", session_id: SESSION_ID }));
  const repeatedResult = await repeatedResponse.json();
  assert.equal(repeatedResponse.status, 200);
  assert.equal(repeatedResult.paid, true);
});

test("does not mark an order paid when Stripe reports an unpaid session", async () => {
  const { handler, order } = fixture({ sessionId: SESSION_ID, sessionPaid: false });
  const response = await handler(request({ action: "verify", session_id: SESSION_ID }));

  assert.equal(response.status, 409);
  assert.equal(order.payment_status, "unpaid");
  assert.equal(order.status, "Pending");
  assert.equal(order.paid_at, null);
});

test("does not mark an order paid for a different amount or Stripe account", async (context) => {
  await context.test("wrong amount", async () => {
    const { handler, order } = fixture({ sessionId: SESSION_ID, amountTotal: 500 });
    const response = await handler(request({ action: "verify", session_id: SESSION_ID }));

    assert.equal(response.status, 409);
    assert.equal(order.payment_status, "unpaid");
  });

  await context.test("different user", async () => {
    const { handler, order } = fixture({ sessionId: SESSION_ID, sessionUserId: OTHER_USER_ID });
    const response = await handler(request({ action: "verify", session_id: SESSION_ID }));

    assert.equal(response.status, 409);
    assert.equal(order.payment_status, "unpaid");
  });
});
