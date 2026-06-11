"use client";

import { createClient } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";

// Anon client — only used to read the current session token
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface BusinessContextType {
  businessId:       string | null;
  businessName:     string | null;
  twilioNumber:     string | null;
  settings:         any;
  subscriptionTier: string | null;
  planFeatures:     any;
  userRole:         string | null;
  memberCount:      number;
  loading:          boolean;
}

const BusinessContext = createContext<BusinessContextType>({
  businessId:       null,
  businessName:     null,
  twilioNumber:     null,
  settings:         null,
  subscriptionTier: null,
  planFeatures:     null,
  userRole:         null,
  memberCount:      0,
  loading:          true,
});

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BusinessContextType>({
    businessId:       null,
    businessName:     null,
    twilioNumber:     null,
    settings:         null,
    subscriptionTier: null,
    planFeatures:     null,
    userRole:         null,
    memberCount:      0,
    loading:          true,
  });

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setState(s => ({ ...s, loading: false })); return; }

      const res = await fetch("/api/my-business", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) { setState(s => ({ ...s, loading: false })); return; }

      const { business: biz, userRole, planFeatures, memberCount } = await res.json();

      setState({
        businessId:       biz?.id ?? null,
        businessName:     biz?.name ?? null,
        twilioNumber:     biz?.twilio_number ?? null,
        settings:         biz?.settings ?? null,
        subscriptionTier: biz?.subscription_tier ?? null,
        planFeatures:     planFeatures ?? null,
        userRole:         userRole ?? null,
        memberCount:      memberCount ?? 0,
        loading:          false,
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
