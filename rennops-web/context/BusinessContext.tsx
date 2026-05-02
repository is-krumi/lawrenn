"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface BusinessContextType {
  businessId:   string | null;
  businessName: string | null;
  twilioNumber: string | null;
  settings:     any;
  loading:      boolean;
}

const BusinessContext = createContext<BusinessContextType>({
  businessId:   null,
  businessName: null,
  twilioNumber: null,
  settings:     null,
  loading:      true,
});

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BusinessContextType>({
    businessId:   null,
    businessName: null,
    twilioNumber: null,
    settings:     null,
    loading:      true,
  });

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setState(s => ({ ...s, loading: false })); return; }

      const { data: biz } = await supabase
        .from("businesses")
        .select("id, name, twilio_number, settings")
        .eq("owner_id", user.id)
        .single();

      setState({
        businessId:   biz?.id ?? null,
        businessName: biz?.name ?? null,
        twilioNumber: biz?.twilio_number ?? null,
        settings:     biz?.settings ?? null,
        loading:      false,
      });
    }
    load();
  }, []);

  return (
    <BusinessContext.Provider value={state}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  return useContext(BusinessContext);
}
