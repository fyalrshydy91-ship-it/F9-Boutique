const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const ORDER_COLUMNS =
  "id,user_id,order_number,status,currency,payment_status,stripe_checkout_session_id,paid_at";

class CheckoutError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function isOrderId(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function checkoutUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function createCheckoutHandler({ getEnv, fetchImpl = fetch, now = () => new Date() }) {
  return async function handleCheckoutRequest(request) {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, 405);
    }

    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Please sign in first.", code: "UNAUTHENTICATED" }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "The checkout request is invalid.", code: "INVALID_REQUEST" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ error: "The checkout request is invalid.", code: "INVALID_REQUEST" }, 400);
    }

    const supabaseUrl = (getEnv("SUPABASE_URL") ?? "").replace(/\/+$/, "");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = getEnv("STRIPE_SECRET_KEY");
    const priceId = getEnv("STRIPE_PRICE_ID");
    const appBaseUrl = getEnv("APP_BASE_URL");
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !stripeSecretKey ||
        !priceId || !appBaseUrl) {
      return jsonResponse({ error: "The test payment service is not configured.", code: "NOT_CONFIGURED" }, 503);
    }
    if (!stripeSecretKey.startsWith("sk_test_")) {
      return jsonResponse({ error: "Only Stripe test mode is enabled.", code: "TEST_MODE_REQUIRED" }, 503);
    }

    let returnOrigin;
    try {
      const configuredUrl = new URL(appBaseUrl);
      if (configuredUrl.protocol !== "https:" || configuredUrl.username || configuredUrl.password) {
        throw new Error("Invalid app URL");
      }
      returnOrigin = configuredUrl.origin;
    } catch {
      return jsonResponse({ error: "The checkout return URL is invalid.", code: "INVALID_RETURN_URL" }, 503);
    }

    let user;
    try {
      const userResponse = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
        headers: { Authorization: authorization, apikey: supabaseAnonKey },
      });
      if (!userResponse.ok) {
        return jsonResponse({ error: "Please sign in again to continue.", code: "UNAUTHENTICATED" }, 401);
      }
      user = await userResponse.json();
    } catch {
      return jsonResponse({ error: "We could not verify your sign-in.", code: "AUTH_UNAVAILABLE" }, 502);
    }
    if (typeof user?.id !== "string" || !user.id) {
      return jsonResponse({ error: "Please sign in again to continue.", code: "UNAUTHENTICATED" }, 401);
    }

    const adminHeaders = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    };

    async function readOrder(orderId) {
      const url = new URL(`${supabaseUrl}/rest/v1/orders`);
      url.searchParams.set("select", ORDER_COLUMNS);
      url.searchParams.set("id", `eq.${orderId}`);
      url.searchParams.set("user_id", `eq.${user.id}`);
      let response;
      try {
        response = await fetchImpl(url, { headers: adminHeaders });
      } catch {
        throw new CheckoutError(502, "ORDER_LOOKUP_FAILED", "We could not verify this order.");
      }
      if (!response.ok) {
        throw new CheckoutError(503, "ORDER_SERVICE_UNAVAILABLE", "Order payment records are not ready.");
      }
      const rows = await response.json().catch(() => null);
      const order = Array.isArray(rows) ? rows[0] : null;
      if (!order || order.user_id !== user.id || order.id !== orderId) {
        throw new CheckoutError(404, "ORDER_NOT_FOUND", "This order could not be found for your account.");
      }
      return order;
    }

    async function updateOrder(
      order,
      sessionId,
      fields,
      expectedPaymentStatus = "unpaid",
      expectedSessionId = sessionId,
    ) {
      const url = new URL(`${supabaseUrl}/rest/v1/orders`);
      url.searchParams.set("id", `eq.${order.id}`);
      url.searchParams.set("user_id", `eq.${user.id}`);
      url.searchParams.set("status", "eq.Pending");
      url.searchParams.set("payment_status", `eq.${expectedPaymentStatus}`);
      url.searchParams.set(
        "stripe_checkout_session_id",
        expectedSessionId === null ? "is.null" : `eq.${expectedSessionId}`,
      );
      let response;
      try {
        response = await fetchImpl(url, {
          method: "PATCH",
          headers: {
            ...adminHeaders,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(fields),
        });
      } catch {
        throw new CheckoutError(502, "ORDER_UPDATE_FAILED", "We could not save the verified payment.");
      }
      if (!response.ok) {
        throw new CheckoutError(503, "ORDER_UPDATE_FAILED", "We could not save the verified payment.");
      }
      const rows = await response.json().catch(() => []);
      return Array.isArray(rows) ? rows[0] ?? null : null;
    }

    async function stripeRequest(path, init = {}) {
      let response;
      try {
        response = await fetchImpl(`https://api.stripe.com${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            ...(init.headers ?? {}),
          },
        });
      } catch {
        throw new CheckoutError(502, "STRIPE_UNAVAILABLE", "Stripe test checkout is temporarily unavailable.");
      }
      const result = await response.json().catch(() => null);
      if (!response.ok || !result || typeof result !== "object") {
        throw new CheckoutError(502, "STRIPE_REQUEST_FAILED", "Stripe test checkout is temporarily unavailable.");
      }
      return result;
    }

    async function validateTestPrice() {
      const price = await stripeRequest(`/v1/prices/${encodeURIComponent(priceId)}`);
      if (price.id !== priceId || price.active !== true || price.currency !== "usd" ||
          price.unit_amount !== 100 || price.recurring) {
        throw new CheckoutError(503, "TEST_PRICE_MISMATCH", "The configured Stripe test Price must be $1 USD.");
      }
    }

    async function verifiedPayment(sessionId) {
      if (typeof sessionId !== "string" || !sessionId.startsWith("cs_test_")) {
        throw new CheckoutError(400, "INVALID_SESSION", "The payment session is invalid.");
      }
      const session = await stripeRequest(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
      const orderId = session.metadata?.order_id;
      if (session.id !== sessionId || session.mode !== "payment" || session.status !== "complete" ||
          session.payment_status !== "paid" || session.currency !== "usd" || session.amount_total !== 100 ||
          session.client_reference_id !== user.id ||
          session.metadata?.supabase_user_id !== user.id || !isOrderId(orderId)) {
        throw new CheckoutError(409, "PAYMENT_NOT_VERIFIED", "Stripe has not confirmed a completed $1 test payment for this account.");
      }

      const lineItems = await stripeRequest(
        `/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?limit=2`,
      );
      if (!Array.isArray(lineItems.data) || lineItems.data.length !== 1 ||
          lineItems.data[0]?.quantity !== 1 || lineItems.data[0]?.price?.id !== priceId ||
          lineItems.data[0]?.price?.currency !== "usd" || lineItems.data[0]?.price?.unit_amount !== 100) {
        throw new CheckoutError(409, "PAYMENT_NOT_VERIFIED", "Stripe has not confirmed the configured $1 test payment.");
      }

      const order = await readOrder(orderId);
      if (order.stripe_checkout_session_id !== sessionId || order.currency !== "KWD") {
        throw new CheckoutError(409, "ORDER_SESSION_MISMATCH", "This payment does not match the saved order.");
      }
      if (order.payment_status === "paid" && order.status === "Processing") {
        return {
          paid: true,
          payment_status: "paid",
          order_id: order.id,
          order_number: order.order_number,
          status: order.status,
        };
      }
      if (order.payment_status !== "unpaid" || order.status !== "Pending") {
        throw new CheckoutError(409, "ORDER_NOT_PAYABLE", "This order is not awaiting payment.");
      }

      const updated = await updateOrder(order, sessionId, {
        payment_status: "paid",
        paid_at: now().toISOString(),
        status: "Processing",
      });
      if (updated?.payment_status === "paid" && updated.stripe_checkout_session_id === sessionId) {
        return {
          paid: true,
          payment_status: "paid",
          order_id: updated.id,
          order_number: updated.order_number,
          status: updated.status,
        };
      }

      const latest = await readOrder(orderId);
      if (latest.payment_status === "paid" && latest.stripe_checkout_session_id === sessionId) {
        return {
          paid: true,
          payment_status: "paid",
          order_id: latest.id,
          order_number: latest.order_number,
          status: latest.status,
        };
      }
      throw new CheckoutError(409, "ORDER_UPDATE_CONFLICT", "The verified payment could not be attached to this order.");
    }

    try {
      if (body.action === "verify") {
        if (typeof body.session_id !== "string") {
          throw new CheckoutError(400, "INVALID_SESSION", "The payment session is invalid.");
        }
        return jsonResponse(await verifiedPayment(body.session_id));
      }
      if (body.action !== "create" || !isOrderId(body.order_id)) {
        throw new CheckoutError(400, "INVALID_REQUEST", "Choose a valid saved order to start checkout.");
      }

      const order = await readOrder(body.order_id);
      if (order.payment_status === "paid" && order.status === "Processing") {
        return jsonResponse({
          paid: true,
          payment_status: "paid",
          order_id: order.id,
          order_number: order.order_number,
          status: order.status,
        });
      }
      if (order.payment_status !== "unpaid" || order.status !== "Pending" || order.currency !== "KWD") {
        throw new CheckoutError(409, "ORDER_NOT_PAYABLE", "This order is not awaiting payment.");
      }

      await validateTestPrice();

      let previousSessionId = null;
      if (typeof order.stripe_checkout_session_id === "string" && order.stripe_checkout_session_id) {
        previousSessionId = order.stripe_checkout_session_id;
        const existing = await stripeRequest(`/v1/checkout/sessions/${encodeURIComponent(previousSessionId)}`);
        if (existing.metadata?.order_id !== order.id || existing.metadata?.supabase_user_id !== user.id) {
          throw new CheckoutError(409, "ORDER_SESSION_MISMATCH", "This checkout session does not match the saved order.");
        }
        if (existing.status === "open" && checkoutUrl(existing.url)) {
          return jsonResponse({
            checkout_url: checkoutUrl(existing.url),
            session_id: existing.id,
            order_id: order.id,
            test_mode: true,
            test_amount: 100,
            test_currency: "usd",
          });
        }
        if (existing.status === "complete" && existing.payment_status === "paid") {
          return jsonResponse(await verifiedPayment(existing.id));
        }
        if (existing.status !== "expired") {
          throw new CheckoutError(409, "CHECKOUT_ALREADY_ACTIVE", "This order already has an active checkout. Please finish it or return to your bag.");
        }
      }

      const successUrl = `${returnOrigin}/?payment=success&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = new URL("/", returnOrigin);
      cancelUrl.searchParams.set("payment", "cancel");
      cancelUrl.searchParams.set("order_id", order.id);
      const form = new URLSearchParams();
      form.set("mode", "payment");
      form.set("line_items[0][price]", priceId);
      form.set("line_items[0][quantity]", "1");
      form.set("success_url", successUrl);
      form.set("cancel_url", cancelUrl.toString());
      form.set("client_reference_id", user.id);
      form.set("metadata[supabase_user_id]", user.id);
      form.set("metadata[order_id]", order.id);
      form.set("payment_intent_data[metadata][supabase_user_id]", user.id);
      form.set("payment_intent_data[metadata][order_id]", order.id);
      if (typeof user.email === "string") form.set("customer_email", user.email);

      const idempotencyKey = previousSessionId
        ? `f9-test-order-${order.id}-after-${previousSessionId}`
        : `f9-test-order-${order.id}-initial`;
      const session = await stripeRequest("/v1/checkout/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": idempotencyKey,
        },
        body: form.toString(),
      });
      const safeCheckoutUrl = checkoutUrl(session.url);
      if (typeof session.id !== "string" || !session.id.startsWith("cs_test_") || !safeCheckoutUrl) {
        throw new CheckoutError(502, "INVALID_STRIPE_SESSION", "Stripe did not return a valid test checkout URL.");
      }

      const stored = await updateOrder(order, session.id, {
        stripe_checkout_session_id: session.id,
      }, "unpaid", previousSessionId);

      if (!stored) {
        const latest = await readOrder(order.id);
        if (latest.stripe_checkout_session_id === session.id) {
          return jsonResponse({
            checkout_url: safeCheckoutUrl,
            session_id: session.id,
            order_id: order.id,
            test_mode: true,
            test_amount: 100,
            test_currency: "usd",
          });
        }
        throw new CheckoutError(409, "ORDER_SESSION_CONFLICT", "Checkout could not be attached to this order. Please retry.");
      }

      return jsonResponse({
        checkout_url: safeCheckoutUrl,
        session_id: session.id,
        order_id: order.id,
        test_mode: true,
        test_amount: 100,
        test_currency: "usd",
      });
    } catch (error) {
      if (error instanceof CheckoutError) {
        return jsonResponse({ error: error.message, code: error.code }, error.status);
      }
      return jsonResponse({ error: "The test payment could not be completed. Please try again.", code: "CHECKOUT_ERROR" }, 500);
    }
  };
}
