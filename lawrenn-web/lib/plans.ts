export type Plan = "starter" | "pro" | "growth";

export const PLAN_FEATURES: Record<Plan, {
  label:             string;
  price:             number;
  intelligence:      boolean;
  outboundSequences: boolean;
  reviewEngine:      boolean;
  smartMessaging:    boolean;
  callRecordings:    boolean;
  maxTeamMembers:    number;
  monthlyCallCap:    number;
  monthlySMS:        number;
  monthlyMinutes:    number;
}> = {
  starter: {
    label:             "Basic",
    price:             84,
    intelligence:      false,
    outboundSequences: false,
    reviewEngine:      false,
    smartMessaging:    true,
    callRecordings:    false,
    maxTeamMembers:    1,
    monthlyCallCap:    50,
    monthlySMS:        200,
    monthlyMinutes:    100,
  },
  pro: {
    label:             "Pro",
    price:             199,
    intelligence:      true,
    outboundSequences: true,
    reviewEngine:      true,
    smartMessaging:    true,
    callRecordings:    true,
    maxTeamMembers:    3,
    monthlyCallCap:    150,
    monthlySMS:        750,
    monthlyMinutes:    300,
  },
  growth: {
    label:             "Growth",
    price:             449,
    intelligence:      true,
    outboundSequences: true,
    reviewEngine:      true,
    smartMessaging:    true,
    callRecordings:    true,
    maxTeamMembers:    999,
    monthlyCallCap:    400,
    monthlySMS:        2500,
    monthlyMinutes:    750,
  },
};

export function getPlanFeatures(tier: string | null) {
  return PLAN_FEATURES[(tier as Plan) ?? "starter"] ?? PLAN_FEATURES.starter;
}

export function isFeatureAvailable(tier: string | null, feature: keyof typeof PLAN_FEATURES.starter): boolean {
  const features = getPlanFeatures(tier);
  return features[feature] === true;
}