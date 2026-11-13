import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { CheckCircle2, XCircle, Loader2, ArrowRight, Download, Home, RefreshCw, ShieldCheck, Clock } from "lucide-react";

export default function PaymentCallback() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"verifying" | "success" | "failed">("verifying");
  const [message, setMessage] = useState("");
  const [orderId, setOrderId] = useState("");
  const [paymentType, setPaymentType] = useState<"deposit" | "balance" | "">("");
  const [dots, setDots] = useState(".");

  useEffect(() => {
    if (status !== "verifying") return;
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? "." : d + ".");
    }, 500);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") || params.get("trxref");

    if (!reference) {
      setStatus("failed");
      setMessage("No payment reference found. Please contact support if you were charged.");
      return;
    }

    const verify = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) {
          headers["Authorization"] = `Bearer ${session.access_token}`;
        }

        const res = await fetch(`/api/payments/verify/${reference}`, { headers });
        const data = await res.json();

        if (data.status === "success") {
          setStatus("success");
          setOrderId(data.orderId || "");
          setPaymentType(data.paymentType || "");
          setMessage(
            data.paymentType === "deposit"
              ? "Your deposit has been confirmed. A researcher will be assigned to your order shortly."
              : "Your full payment is confirmed! Your research will be available for download once completed."
          );
        } else {
          setStatus("failed");
          setMessage(data.message || "Payment could not be verified. Please contact support.");
        }
      } catch {
        setStatus("failed");
        setMessage("A network error occurred while verifying your payment. Please contact support.");
      }
    };

    verify();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient background circles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className={`absolute -top-32 -left-32 w-96 h-96 rounded-full blur-3xl transition-all duration-1000 ${
          status === "success" ? "bg-emerald-500/10" : status === "failed" ? "bg-red-500/10" : "bg-indigo-500/10"
        }`} />
        <div className={`absolute -bottom-32 -right-32 w-96 h-96 rounded-full blur-3xl transition-all duration-1000 ${
          status === "success" ? "bg-teal-500/10" : status === "failed" ? "bg-rose-500/10" : "bg-violet-500/10"
        }`} />
      </div>

      <div className="relative w-full max-w-lg">
        {/* Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden">
          {/* Top accent bar */}
          <div className={`h-1.5 w-full transition-all duration-700 ${
            status === "verifying" ? "bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500 bg-[length:200%_100%] animate-pulse" :
            status === "success" ? "bg-gradient-to-r from-emerald-400 to-teal-400" :
            "bg-gradient-to-r from-red-400 to-rose-400"
          }`} />

          <div className="p-8 sm:p-10">
            {/* Verifying State */}
            {status === "verifying" && (
              <div className="text-center">
                <div className="relative w-28 h-28 mx-auto mb-8">
                  {/* Outer ring */}
                  <div className="absolute inset-0 rounded-full border-4 border-slate-700" />
                  {/* Spinning ring */}
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-500 animate-spin" />
                  {/* Inner glow */}
                  <div className="absolute inset-4 rounded-full bg-indigo-500/10 flex items-center justify-center">
                    <ShieldCheck className="w-9 h-9 text-indigo-400" />
                  </div>
                </div>

                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                  Verifying Payment{dots}
                </h1>
                <p className="text-slate-400 text-sm leading-relaxed mb-8">
                  Please wait while we securely confirm your transaction with Paystack. This usually takes just a moment.
                </p>

                {/* Steps */}
                <div className="space-y-3 text-left">
                  {[
                    { label: "Connecting to payment gateway", done: true },
                    { label: "Confirming transaction status", done: false },
                    { label: "Updating your order", done: false },
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/50">
                      {step.done ? (
                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
                          <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
                        </div>
                      )}
                      <span className={`text-sm ${step.done ? "text-slate-300" : "text-slate-400"}`}>
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Success State */}
            {status === "success" && (
              <div className="text-center">
                <div className="relative w-28 h-28 mx-auto mb-8">
                  <div className="absolute inset-0 rounded-full bg-emerald-500/10 animate-ping" style={{ animationDuration: "2s" }} />
                  <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-emerald-400/20 to-teal-400/20 border border-emerald-500/30 flex items-center justify-center">
                    <CheckCircle2 className="w-14 h-14 text-emerald-400" />
                  </div>
                </div>

                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-4 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Payment Confirmed
                </div>

                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                  {paymentType === "deposit" ? "Deposit Received!" : "Payment Complete!"}
                </h1>
                <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-sm mx-auto">
                  {message}
                </p>

                {/* Info banner */}
                <div className="flex items-start gap-3 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl mb-6 text-left">
                  <Clock className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-slate-300">
                    {paymentType === "deposit"
                      ? "Your order is now queued for assignment. A researcher will pick it up and start work within 24 hours."
                      : "Your order is fully paid. You can download your completed research from your order page."}
                  </p>
                </div>

                <div className="space-y-3">
                  {orderId && (
                    <button
                      onClick={() => setLocation(`/student/orders/${orderId}`)}
                      className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:from-emerald-400 hover:to-teal-400 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                    >
                      {paymentType === "balance" ? <Download className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                      {paymentType === "balance" ? "View & Download" : "Track My Order"}
                    </button>
                  )}
                  <button
                    onClick={() => setLocation("/student/dashboard")}
                    className="w-full py-3 px-6 rounded-2xl border border-slate-700 text-slate-300 font-medium hover:bg-slate-800/50 hover:border-slate-600 transition-all flex items-center justify-center gap-2"
                  >
                    <Home className="w-4 h-4" /> Go to Dashboard
                  </button>
                </div>
              </div>
            )}

            {/* Failed State */}
            {status === "failed" && (
              <div className="text-center">
                <div className="relative w-28 h-28 mx-auto mb-8">
                  <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-red-400/20 to-rose-400/20 border border-red-500/30 flex items-center justify-center">
                    <XCircle className="w-14 h-14 text-red-400" />
                  </div>
                </div>

                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold mb-4 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  Verification Failed
                </div>

                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                  Payment Issue
                </h1>
                <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-sm mx-auto">
                  {message}
                </p>

                <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl mb-6 text-left">
                  <ShieldCheck className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-slate-300">
                    If your card or M-PESA was charged, please don't worry. Contact our support team with your transaction details and we'll resolve it promptly.
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => window.location.reload()}
                    className="w-full py-3.5 px-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 font-semibold hover:bg-red-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" /> Try Again
                  </button>
                  <button
                    onClick={() => setLocation("/student/dashboard")}
                    className="w-full py-3 px-6 rounded-2xl border border-slate-700 text-slate-300 font-medium hover:bg-slate-800/50 hover:border-slate-600 transition-all flex items-center justify-center gap-2"
                  >
                    <Home className="w-4 h-4" /> Go to Dashboard
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 pb-6 text-center">
            <p className="text-xs text-slate-600">
              Secured by Paystack · Sasyna — The World of Research
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
