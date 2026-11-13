import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending_payment: { label: "Pending Payment", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  pending_assignment: { label: "Pending Assignment", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  assigned: { label: "Assigned", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300" },
  in_progress: { label: "In Progress", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  under_review: { label: "Under Review", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  completed: { label: "Completed", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  awaiting_balance: { label: "Awaiting Balance", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  ready_for_download: { label: "Ready for Download", className: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300" },
  closed: { label: "Closed", className: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300" },
  refund_requested: { label: "Waiting Approval", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  refunded: { label: "Refunded", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { label: status, className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300" };

  return (
    <span className={cn("px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider whitespace-nowrap", config.className)}>
      {config.label}
    </span>
  );
}
