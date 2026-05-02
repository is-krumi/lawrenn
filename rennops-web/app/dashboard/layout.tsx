import { BusinessProvider } from "@/context/BusinessContext";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <BusinessProvider>
      {children}
    </BusinessProvider>
  );
}
