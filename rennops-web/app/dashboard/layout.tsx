import { BusinessProvider } from "@/context/BusinessContext";
import DashboardNav from "@/components/DashboardNav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <BusinessProvider>
      <DashboardNav />
      {/* Offset content: 220px sidebar + 52px top bar */}
      <div style={{ marginLeft: 220, paddingTop: 52, minHeight: "100vh" }}>
        {children}
      </div>
    </BusinessProvider>
  );
}
