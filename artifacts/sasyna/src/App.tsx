import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";

import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Login from "@/pages/auth/Login";
import Register from "@/pages/auth/Register";
import PaymentCallback from "@/pages/PaymentCallback";

// Student
import StudentDashboard from "@/pages/student/Dashboard";
import ResearchStudio from "@/pages/student/ResearchStudio";
import OrderDetails from "@/pages/student/OrderDetails";
import StudentRevisions from "@/pages/student/Revisions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

// Admin
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminOrderDetails from "@/pages/admin/OrderDetails";
import AdminEarnings from "@/pages/admin/Earnings";
import AdminRevisions from "@/pages/admin/Revisions";
import AdminWalletSettings from "@/pages/admin/WalletSettings";

// SuperAdmin
import SuperAdminDashboard from "@/pages/superadmin/Dashboard";
import SuperAdminRevenue from "@/pages/superadmin/Revenue";
import SuperAdminAdmins from "@/pages/superadmin/Admins";
import SuperAdminPricing from "@/pages/superadmin/Pricing";
import SuperAdminWithdrawals from "@/pages/superadmin/Withdrawals";
import SuperAdminRevisions from "@/pages/superadmin/Revisions";
import SuperAdminRefunds from "@/pages/superadmin/Refunds";
import SuperAdminStudents from "@/pages/superadmin/Students";
import SuperAdminOrders from "@/pages/superadmin/Orders";
import SuperAdminSettings from "@/pages/superadmin/Settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    }
  }
});

function ProtectedRoute({ component: Component, allowedRole }: { component: any, allowedRole: string }) {
  const { user, role, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;

  if (!user || role !== allowedRole) {
    setLocation("/login");
    return null;
  }

  return <Component />;
}

function Router() {
  const StudentResearchStudio = () => <DashboardLayout><ResearchStudio /></DashboardLayout>;
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/payment/callback" component={PaymentCallback} />

      {/* Student Routes */}
      <Route path="/student/dashboard" component={() => <ProtectedRoute component={StudentDashboard} allowedRole="student" />} />
      <Route path="/student/research" component={() => <ProtectedRoute component={StudentResearchStudio} allowedRole="student" />} />
      <Route path="/student/orders/new" component={() => <ProtectedRoute component={StudentResearchStudio} allowedRole="student" />} />
      <Route path="/student/orders/:id" component={() => <ProtectedRoute component={OrderDetails} allowedRole="student" />} />
      <Route path="/student/revisions" component={() => <ProtectedRoute component={StudentRevisions} allowedRole="student" />} />

      {/* Admin Routes */}
      <Route path="/admin/dashboard" component={() => <ProtectedRoute component={AdminDashboard} allowedRole="admin" />} />
      <Route path="/admin/orders/:id" component={() => <ProtectedRoute component={AdminOrderDetails} allowedRole="admin" />} />
      <Route path="/admin/earnings" component={() => <ProtectedRoute component={AdminEarnings} allowedRole="admin" />} />
      <Route path="/admin/revisions" component={() => <ProtectedRoute component={AdminRevisions} allowedRole="admin" />} />
      <Route path="/admin/wallet-settings" component={() => <ProtectedRoute component={AdminWalletSettings} allowedRole="admin" />} />

      {/* Super Admin Routes */}
      <Route path="/superadmin/dashboard" component={() => <ProtectedRoute component={SuperAdminDashboard} allowedRole="superadmin" />} />
      <Route path="/superadmin/revenue" component={() => <ProtectedRoute component={SuperAdminRevenue} allowedRole="superadmin" />} />
      <Route path="/superadmin/admins" component={() => <ProtectedRoute component={SuperAdminAdmins} allowedRole="superadmin" />} />
      <Route path="/superadmin/pricing" component={() => <ProtectedRoute component={SuperAdminPricing} allowedRole="superadmin" />} />
      <Route path="/superadmin/withdrawals" component={() => <ProtectedRoute component={SuperAdminWithdrawals} allowedRole="superadmin" />} />
      <Route path="/superadmin/revisions" component={() => <ProtectedRoute component={SuperAdminRevisions} allowedRole="superadmin" />} />
      <Route path="/superadmin/refunds" component={() => <ProtectedRoute component={SuperAdminRefunds} allowedRole="superadmin" />} />
      <Route path="/superadmin/students" component={() => <ProtectedRoute component={SuperAdminStudents} allowedRole="superadmin" />} />
      <Route path="/superadmin/orders" component={() => <ProtectedRoute component={SuperAdminOrders} allowedRole="superadmin" />} />
      <Route path="/superadmin/settings" component={() => <ProtectedRoute component={SuperAdminSettings} allowedRole="superadmin" />} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
