import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase.js";
import crypto from "crypto";

const router: IRouter = Router();
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "";
// Checkout stays paused until the Sasyna research workspace is ready to charge.
const PAYMENTS_ENABLED = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function creditAdminWalletOnBalance(orderId: string) {
  const { data: order } = await supabase
    .from("orders")
    .select("assigned_admin_id, admin_share, total_amount, deposit_amount")
    .or(`id.eq.${orderId},order_id.eq.${orderId}`)
    .single();

  if (!order || !order.assigned_admin_id) return;

  const adminShare = Number(order.admin_share) || Number(order.total_amount) * 0.5;
  if (adminShare <= 0) return;

  const totalAmt = Number(order.total_amount) || 0;
  const depositAmt = Number(order.deposit_amount) || totalAmt * 0.5;
  const balanceAmt = totalAmt - depositAmt;
  const balanceCredit = balanceAmt * 0.5;

  const { data: profile } = await supabase
    .from("profiles")
    .select("pending_wallet, wallet_balance")
    .eq("id", order.assigned_admin_id)
    .single();

  const currentPending = Number(profile?.pending_wallet) || 0;
  const currentBalance = Number(profile?.wallet_balance) || 0;
  const pendingDeduction = Math.min(currentPending, balanceCredit);
  const newPending = Math.max(0, currentPending - pendingDeduction);
  const newBalance = currentBalance + balanceCredit;

  await supabase
    .from("profiles")
    .update({
      pending_wallet: newPending,
      wallet_balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.assigned_admin_id);
}

/**
 * Core payment application logic — shared between webhook and verify.
 * Idempotent: checks if reference was already successfully processed.
 */
async function applyPayment(
  reference: string,
  orderId: string,
  paymentType: string,
  amountPaid: number
) {
  // Idempotency: skip if this reference was already applied successfully
  const { data: existing } = await supabase
    .from("payments")
    .select("status")
    .eq("reference", reference)
    .maybeSingle();

  if (existing?.status === "success") {
    console.log(`[payments] Reference ${reference} already applied — skipping`);
    return { skipped: true };
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (paymentType === "deposit") {
    updates.deposit_paid = true;
    updates.deposit_reference = reference;
    updates.status = "pending_assignment";
  } else if (paymentType === "full") {
    updates.deposit_paid = true;
    updates.balance_paid = true;
    updates.deposit_reference = reference;
    updates.balance_reference = reference;
    updates.status = "pending_assignment";
  } else if (paymentType === "balance") {
    updates.balance_paid = true;
    updates.balance_reference = reference;
    updates.status = "ready_for_download";
  }

  await supabase
    .from("orders")
    .update(updates)
    .or(`id.eq.${orderId},order_id.eq.${orderId}`);

  // Upsert payment record — mark as success
  await supabase
    .from("payments")
    .upsert(
      {
        order_id: orderId,
        reference,
        payment_type: paymentType,
        amount: amountPaid,
        status: "success",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "reference" }
    );

  if (paymentType === "balance") {
    await creditAdminWalletOnBalance(orderId);
  }

  console.log(`[payments] Applied ${paymentType} payment for order ${orderId} via reference ${reference}`);
  return { skipped: false };
}

// ── POST /payments/initialize ─────────────────────────────────────────────────
// Initializes a Paystack transaction and immediately persists the reference
// so the webhook or recheck can process it even if the user closes the browser.

router.post("/payments/initialize", async (req, res) => {
  if (!PAYMENTS_ENABLED) {
    res.status(503).json({ error: "Payments are temporarily paused. Sasyna research proposals are currently free." });
    return;
  }
  try {
    const { orderId, email, amount, paymentType } = req.body as {
      orderId: string;
      email: string;
      amount: number;
      paymentType: string;
    };

    const reference = `SASYNA-${orderId}-${paymentType.toUpperCase()}-${Date.now()}`;

    const origin = req.headers.origin as string | undefined;
    const baseUrl =
      process.env.APP_BASE_URL ||
      origin ||
      `https://${process.env.REPLIT_DEV_DOMAIN || "localhost:5000"}`;
    const callbackUrl = `${baseUrl}/payment/callback`;

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: Math.round(amount * 100),
        reference,
        callback_url: callbackUrl,
        metadata: { orderId, paymentType },
      }),
    });

    const result = (await response.json()) as {
      status: boolean;
      data?: { authorization_url: string; access_code: string; reference: string };
      message?: string;
    };

    if (!result.status || !result.data) {
      res.status(400).json({ error: result.message || "Payment initialization failed" });
      return;
    }

    // ── Persist the pending reference immediately ──────────────────────────────
    // This is the critical step: if the user closes the browser before the
    // callback fires, this record lets the webhook or /recheck endpoint
    // find and process the payment later.
    await supabase.from("payments").upsert(
      {
        order_id: orderId,
        reference: result.data.reference,
        payment_type: paymentType,
        amount,
        status: "pending",
        email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "reference" }
    );

    res.json({
      authorizationUrl: result.data.authorization_url,
      accessCode: result.data.access_code,
      reference: result.data.reference,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ── GET /payments/verify/:reference ──────────────────────────────────────────
// Called by the frontend payment callback page after redirect.
// Uses applyPayment() for idempotency — safe to call multiple times.

router.get("/payments/verify/:reference", async (req, res) => {
  try {
    const { reference } = req.params;

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );

    const result = (await response.json()) as {
      status: boolean;
      data?: {
        status: string;
        metadata?: { orderId?: string; paymentType?: string };
        amount?: number;
      };
      message?: string;
    };

    if (!result.status || !result.data) {
      res.status(400).json({ status: "failed", message: result.message || "Verification failed" });
      return;
    }

    const txData = result.data;

    if (txData.status === "success") {
      const orderId = txData.metadata?.orderId;
      const paymentType = txData.metadata?.paymentType;
      const amountPaid = (txData.amount || 0) / 100;

      if (orderId && paymentType) {
        await applyPayment(reference, orderId, paymentType, amountPaid);
      }

      res.json({ status: "success", message: "Payment verified", orderId, paymentType });
    } else {
      res.json({ status: txData.status, message: "Payment not successful" });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ── POST /payments/recheck/:orderId ──────────────────────────────────────────
// Called by the student's Order Details page when the order is still in
// pending_payment status (i.e. the browser was closed before the callback).
// Looks up all pending references for this order and re-verifies each one
// with Paystack. Safe to call multiple times — applyPayment() is idempotent.

router.post("/payments/recheck/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    // Find all pending payment records for this order
    const { data: pendingPayments } = await supabase
      .from("payments")
      .select("reference, payment_type, amount")
      .eq("order_id", orderId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(10);

    if (!pendingPayments || pendingPayments.length === 0) {
      // Also check if order is already paid (race condition / double-check)
      const { data: order } = await supabase
        .from("orders")
        .select("status, deposit_paid, balance_paid")
        .or(`id.eq.${orderId},order_id.eq.${orderId}`)
        .single();

      res.json({
        found: false,
        message: "No pending payment references found for this order.",
        orderStatus: order?.status || null,
        depositPaid: order?.deposit_paid || false,
        balancePaid: order?.balance_paid || false,
      });
      return;
    }

    let appliedAny = false;
    let appliedPaymentType = "";

    for (const payment of pendingPayments) {
      try {
        const verifyRes = await fetch(
          `https://api.paystack.co/transaction/verify/${payment.reference}`,
          { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
        );

        const verifyResult = (await verifyRes.json()) as {
          status: boolean;
          data?: {
            status: string;
            amount?: number;
            metadata?: { orderId?: string; paymentType?: string };
          };
        };

        if (
          verifyResult.status &&
          verifyResult.data?.status === "success"
        ) {
          const txOrderId = verifyResult.data.metadata?.orderId || orderId;
          const txPaymentType = verifyResult.data.metadata?.paymentType || payment.payment_type;
          const amountPaid = (verifyResult.data.amount || 0) / 100 || payment.amount;

          const result = await applyPayment(payment.reference, txOrderId, txPaymentType, amountPaid);
          if (!result.skipped) {
            appliedAny = true;
            appliedPaymentType = txPaymentType;
          }
        }
      } catch (innerErr) {
        console.error(`[recheck] Error verifying reference ${payment.reference}:`, innerErr);
      }
    }

    // Return latest order status
    const { data: updatedOrder } = await supabase
      .from("orders")
      .select("status, deposit_paid, balance_paid")
      .or(`id.eq.${orderId},order_id.eq.${orderId}`)
      .single();

    res.json({
      found: true,
      applied: appliedAny,
      paymentType: appliedPaymentType || null,
      orderStatus: updatedOrder?.status || null,
      depositPaid: updatedOrder?.deposit_paid || false,
      balancePaid: updatedOrder?.balance_paid || false,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ── POST /payments/webhook ────────────────────────────────────────────────────
// Paystack calls this server-to-server on every charge.success event.
// IMPORTANT: express.raw() is applied to this route in app.ts BEFORE
// express.json(), so req.body here is a raw Buffer — not a parsed object.
// We verify the HMAC against the raw bytes, then JSON.parse ourselves.

router.post("/payments/webhook", async (req, res) => {
  try {
    // req.body is a Buffer thanks to express.raw() registered in app.ts
    const rawBody: Buffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body));

    const hash = crypto
      .createHmac("sha512", PAYSTACK_SECRET)
      .update(rawBody)
      .digest("hex");

    const signature = req.headers["x-paystack-signature"] as string;

    if (!signature || hash !== signature) {
      console.warn("[webhook] HMAC mismatch — request rejected");
      res.status(400).json({ received: false, reason: "invalid signature" });
      return;
    }

    const payload = JSON.parse(rawBody.toString("utf8")) as {
      event: string;
      data: {
        status: string;
        reference: string;
        amount: number;
        metadata?: { orderId?: string; paymentType?: string };
      };
    };

    const { event, data } = payload;

    if (event === "charge.success") {
      const orderId = data.metadata?.orderId;
      const paymentType = data.metadata?.paymentType;
      const amountPaid = data.amount / 100;

      if (orderId && paymentType) {
        await applyPayment(data.reference, orderId, paymentType, amountPaid);
        console.log(`[webhook] charge.success processed for order ${orderId}`);
      } else {
        console.warn("[webhook] charge.success missing orderId or paymentType in metadata", data.metadata);
      }
    }

    // Always respond 200 quickly — Paystack retries if it gets anything else
    res.json({ received: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[webhook] Error:", msg);
    // Still return 200 to prevent Paystack from retrying a malformed payload
    res.json({ received: true });
  }
});

export default router;
