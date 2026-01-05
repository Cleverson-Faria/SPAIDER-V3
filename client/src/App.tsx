import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "next-themes";
import { queryClient } from "@/lib/queryClient";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Domains from "./pages/admin/Domains";
import SuperAdmin from "./pages/admin/SuperAdmin";
import Users from "./pages/admin/Users";
import ReferenceOrders from "./pages/admin/ReferenceOrders";
import Characteristics from "./pages/admin/Characteristics";
import SapCredentials from "./pages/admin/SapCredentials";
import SapLogs from "./pages/admin/SapLogs";
import TestHistory from "./pages/TestHistory";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

function App() {

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/admin/domains" element={<Domains />} />
                <Route path="/admin/users" element={<Users />} />
                <Route path="/admin/reference-orders" element={<ReferenceOrders />} />
                <Route path="/admin/characteristics" element={<Characteristics />} />
                <Route path="/admin/sap-credentials" element={<SapCredentials />} />
                <Route path="/admin/sap-logs" element={<SapLogs />} />
                <Route path="/admin/super" element={<SuperAdmin />} />
                <Route path="/test-history" element={<TestHistory />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
