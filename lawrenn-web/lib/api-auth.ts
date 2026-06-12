import { createClient } from "@supabase/supabase-js";

function parseJwt(token: string): { sub: string } | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return payload?.sub ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Verifies the Bearer JWT in the request and confirms the user belongs to
 * business_id (either as an accepted business_member or as the owner).
 *
 * Returns { userId, token } on success, or null if the request should be rejected.
 * Callers should return 401 when this returns null.
 *
 * Use the returned token to create a user-scoped client via createUserClient()
 * for all data queries so Supabase RLS is enforced.
 */
export async function verifyBusinessAccess(
  request: Request,
  business_id: string
): Promise<{ userId: string; token: string } | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const claims = parseJwt(token);
  if (!claims) return null;
  const userId = claims.sub;

  // Service role is intentional here — this is the auth check itself,
  // not a data access operation.
  const adminDb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // Primary: accepted team member
  const { data: membership } = await adminDb
    .from("business_members")
    .select("role")
    .eq("business_id", business_id)
    .eq("user_id", userId)
    .not("accepted_at", "is", null)
    .maybeSingle();

  if (membership) return { userId, token };

  // Fallback: owner (predates business_members table)
  const { data: owned } = await adminDb
    .from("businesses")
    .select("id")
    .eq("id", business_id)
    .eq("owner_id", userId)
    .maybeSingle();

  if (owned) return { userId, token };

  return null;
}

/**
 * Creates a Supabase client authenticated as the user.
 * Uses the anon key + user JWT so Row-Level Security policies are enforced.
 *
 * Use this for all direct table reads/writes (documents, jobs, conversations…).
 * Keep the service-role client only for storage, RPCs, and embeddings.
 *
 * Required RLS policies (run once in Supabase SQL editor):
 *
 *   -- Reusable helper function
 *   CREATE OR REPLACE FUNCTION user_business_ids()
 *   RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
 *     SELECT id FROM businesses WHERE owner_id = auth.uid()
 *     UNION
 *     SELECT business_id FROM business_members
 *       WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
 *   $$;
 *
 *   -- Apply to each table:
 *   ALTER TABLE documents                 ENABLE ROW LEVEL SECURITY;
 *   ALTER TABLE jobs                      ENABLE ROW LEVEL SECURITY;
 *   ALTER TABLE intelligence_conversations ENABLE ROW LEVEL SECURITY;
 *   ALTER TABLE intelligence_messages      ENABLE ROW LEVEL SECURITY;
 *
 *   CREATE POLICY "business_access" ON documents
 *     USING (business_id IN (SELECT user_business_ids()))
 *     WITH CHECK (business_id IN (SELECT user_business_ids()));
 *
 *   CREATE POLICY "business_access" ON jobs
 *     USING (business_id IN (SELECT user_business_ids()));
 *
 *   CREATE POLICY "business_access" ON intelligence_conversations
 *     USING (business_id IN (SELECT user_business_ids()))
 *     WITH CHECK (business_id IN (SELECT user_business_ids()));
 *
 *   CREATE POLICY "business_access" ON intelligence_messages
 *     USING (business_id IN (SELECT user_business_ids()))
 *     WITH CHECK (business_id IN (SELECT user_business_ids()));
 */
export function createUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}
