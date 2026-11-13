import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase.js";

const router: IRouter = Router();

const requireAdmin = (
  req: Parameters<Parameters<typeof router.get>[1]>[0],
  res: Parameters<Parameters<typeof router.get>[1]>[1]
) => {
  const role = req.headers["x-user-role"] as string;
  if (role !== "admin" && role !== "superadmin") {
    res.status(403).json({ error: "Admins only" });
    return false;
  }
  return true;
};

router.get("/profile/wallet", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const userId = req.headers["x-user-id"] as string;

    const { data, error } = await supabase
      .from("profiles")
      .select("wallet_type, wallet_mpesa_number, wallet_bank_name, wallet_bank_account_number, wallet_bank_account_name, phone_number, national_id")
      .eq("id", userId)
      .single();

    if (error) throw error;

    res.json({
      walletType: data.wallet_type || null,
      walletMpesaNumber: data.wallet_mpesa_number || null,
      walletBankName: data.wallet_bank_name || null,
      walletBankAccountNumber: data.wallet_bank_account_number || null,
      walletBankAccountName: data.wallet_bank_account_name || null,
      phoneNumber: data.phone_number || null,
      nationalId: data.national_id || null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.patch("/profile/wallet", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const userId = req.headers["x-user-id"] as string;

    const {
      walletType,
      walletMpesaNumber,
      walletBankName,
      walletBankAccountNumber,
      walletBankAccountName,
    } = req.body as {
      walletType?: string;
      walletMpesaNumber?: string;
      walletBankName?: string;
      walletBankAccountNumber?: string;
      walletBankAccountName?: string;
    };

    if (!walletType || !["mpesa", "bank"].includes(walletType)) {
      res.status(400).json({ error: "Invalid wallet type. Must be 'mpesa' or 'bank'." });
      return;
    }

    if (walletType === "mpesa" && !walletMpesaNumber?.trim()) {
      res.status(400).json({ error: "M-Pesa number is required." });
      return;
    }

    if (walletType === "bank") {
      if (!walletBankName?.trim()) {
        res.status(400).json({ error: "Bank name is required." });
        return;
      }
      if (!walletBankAccountNumber?.trim()) {
        res.status(400).json({ error: "Bank account number is required." });
        return;
      }
      if (!walletBankAccountName?.trim()) {
        res.status(400).json({ error: "Bank account name (as in bank) is required." });
        return;
      }
    }

    const updateData: Record<string, unknown> = {
      wallet_type: walletType,
      wallet_mpesa_number: walletType === "mpesa" ? walletMpesaNumber!.trim() : null,
      wallet_bank_name: walletType === "bank" ? walletBankName!.trim() : null,
      wallet_bank_account_number: walletType === "bank" ? walletBankAccountNumber!.trim() : null,
      wallet_bank_account_name: walletType === "bank" ? walletBankAccountName!.trim() : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", userId);

    if (error) throw error;

    res.json({
      walletType,
      walletMpesaNumber: walletType === "mpesa" ? walletMpesaNumber!.trim() : null,
      walletBankName: walletType === "bank" ? walletBankName!.trim() : null,
      walletBankAccountNumber: walletType === "bank" ? walletBankAccountNumber!.trim() : null,
      walletBankAccountName: walletType === "bank" ? walletBankAccountName!.trim() : null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
