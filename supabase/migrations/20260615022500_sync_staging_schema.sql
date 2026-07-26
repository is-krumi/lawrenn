


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."get_business_limits"("p_business_id" "uuid") RETURNS TABLE("monthly_call_cap" integer, "monthly_sms_cap" integer, "monthly_minutes_cap" integer, "max_team_members" integer, "intelligence" boolean, "outbound_sequences" boolean, "review_engine" boolean, "smart_messaging" boolean, "call_recordings" boolean)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    COALESCE(b.override_call_cap,    pf.monthly_call_cap)    as monthly_call_cap,
    COALESCE(b.override_sms_cap,     pf.monthly_sms_cap)     as monthly_sms_cap,
    COALESCE(b.override_minutes_cap, pf.monthly_minutes_cap) as monthly_minutes_cap,
    pf.max_team_members,
    pf.intelligence,
    pf.outbound_sequences,
    pf.review_engine,
    pf.smart_messaging,
    pf.call_recordings
  FROM businesses b
  JOIN plan_features pf ON pf.plan = b.subscription_tier
  WHERE b.id = p_business_id;
$$;


ALTER FUNCTION "public"."get_business_limits"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_call_count"("p_business_id" "uuid", "p_days" integer) RETURNS integer
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COUNT(*)::int FROM calls
  WHERE business_id = p_business_id
  AND created_at >= now() - (p_days || ' days')::interval;
$$;


ALTER FUNCTION "public"."get_call_count"("p_business_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_calls_by_day_of_week"("p_business_id" "uuid", "p_days" integer) RETURNS TABLE("day_name" "text", "call_count" integer)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    TO_CHAR(created_at AT TIME ZONE 'America/New_York', 'Day') as day_name,
    COUNT(*)::int as call_count
  FROM calls
  WHERE business_id = p_business_id
  AND created_at >= now() - (p_days || ' days')::interval
  GROUP BY TO_CHAR(created_at AT TIME ZONE 'America/New_York', 'Day')
  ORDER BY call_count DESC;
$$;


ALTER FUNCTION "public"."get_calls_by_day_of_week"("p_business_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_calls_by_hour"("p_business_id" "uuid", "p_days" integer) RETURNS TABLE("hour_of_day" integer, "call_count" integer)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/New_York')::int as hour_of_day,
    COUNT(*)::int as call_count
  FROM calls
  WHERE business_id = p_business_id
  AND created_at >= now() - (p_days || ' days')::interval
  GROUP BY EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/New_York')
  ORDER BY call_count DESC;
$$;


ALTER FUNCTION "public"."get_calls_by_hour"("p_business_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_calls_by_outcome"("p_business_id" "uuid", "p_days" integer) RETURNS TABLE("outcome" "text", "call_count" integer)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    COALESCE(outcome, 'unknown') as outcome,
    COUNT(*)::int as call_count
  FROM calls
  WHERE business_id = p_business_id
  AND created_at >= now() - (p_days || ' days')::interval
  GROUP BY outcome
  ORDER BY call_count DESC;
$$;


ALTER FUNCTION "public"."get_calls_by_outcome"("p_business_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_daily_call_counts"("p_business_id" "uuid", "p_days" integer) RETURNS TABLE("call_date" "text", "call_count" integer)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    TO_CHAR(created_at AT TIME ZONE 'America/New_York', 'Day, Mon DD') as call_date,
    COUNT(*)::int as call_count
  FROM calls
  WHERE business_id = p_business_id
  AND created_at >= now() - (p_days || ' days')::interval
  GROUP BY TO_CHAR(created_at AT TIME ZONE 'America/New_York', 'Day, Mon DD'),
           DATE_TRUNC('day', created_at AT TIME ZONE 'America/New_York')
  ORDER BY DATE_TRUNC('day', created_at AT TIME ZONE 'America/New_York') DESC;
$$;


ALTER FUNCTION "public"."get_daily_call_counts"("p_business_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_seat_count"("p_business_id" "uuid") RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT COUNT(*)::integer FROM business_members
  WHERE business_id = p_business_id
    AND (accepted_at IS NOT NULL OR invited_email IS NOT NULL);
$$;


ALTER FUNCTION "public"."get_seat_count"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_call_count"("p_business_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Roll reset date forward if past due
  UPDATE businesses
  SET monthly_call_count   = 0,
      monthly_call_minutes = 0,
      monthly_sms_count    = 0,
      usage_reset_at       = usage_reset_at + interval '1 month'
  WHERE id = p_business_id
  AND usage_reset_at < now();

  -- Increment call count
  UPDATE businesses
  SET monthly_call_count = monthly_call_count + 1
  WHERE id = p_business_id;
END;
$$;


ALTER FUNCTION "public"."increment_call_count"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_call_minutes"("p_business_id" "uuid", "p_minutes" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE businesses
  SET monthly_call_count   = 0,
      monthly_call_minutes = 0,
      monthly_sms_count    = 0,
      usage_reset_at       = usage_reset_at + interval '1 month'
  WHERE id = p_business_id
  AND usage_reset_at < now();

  UPDATE businesses
  SET monthly_call_minutes = monthly_call_minutes + p_minutes
  WHERE id = p_business_id;
END;
$$;


ALTER FUNCTION "public"."increment_call_minutes"("p_business_id" "uuid", "p_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_sms_count"("p_business_id" "uuid", "p_count" integer DEFAULT 1) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE businesses
  SET monthly_call_count   = 0,
      monthly_call_minutes = 0,
      monthly_sms_count    = 0,
      usage_reset_at       = usage_reset_at + interval '1 month'
  WHERE id = p_business_id
  AND usage_reset_at < now();

  UPDATE businesses
  SET monthly_sms_count = monthly_sms_count + p_count
  WHERE id = p_business_id;
END;
$$;


ALTER FUNCTION "public"."increment_sms_count"("p_business_id" "uuid", "p_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_embeddings"("query_embedding" "public"."vector", "match_business_id" "uuid", "match_source_type" "text" DEFAULT NULL::"text", "match_count" integer DEFAULT 8) RETURNS TABLE("source_type" "text", "source_id" "uuid", "content" "text", "similarity" double precision)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT source_type, source_id, content, 1 - (embedding <=> query_embedding) AS similarity
  FROM embeddings
  WHERE business_id = match_business_id
    AND (match_source_type IS NULL OR source_type = match_source_type)
  ORDER BY embedding <=> query_embedding LIMIT match_count;
$$;


ALTER FUNCTION "public"."match_embeddings"("query_embedding" "public"."vector", "match_business_id" "uuid", "match_source_type" "text", "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_embeddings"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_business_id" "uuid", "p_customer_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "content" "text", "source_type" "text", "source_id" "uuid", "similarity" double precision)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT e.id, e.content, e.source_type, e.source_id,
    1 - (e.embedding::vector(1536) <=> query_embedding) AS similarity
  FROM public.embeddings e
  WHERE e.business_id = p_business_id
    AND (p_customer_id IS NULL OR e.customer_id = p_customer_id)
    AND 1 - (e.embedding::vector(1536) <=> query_embedding) > match_threshold
  ORDER BY e.embedding::vector(1536) <=> query_embedding LIMIT match_count;
END;
$$;


ALTER FUNCTION "public"."match_embeddings"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_business_id" "uuid", "p_customer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_knowledge"("query_embedding" "public"."vector", "business_uuid" "uuid", "match_count" integer DEFAULT 3) RETURNS TABLE("content" "text", "similarity" double precision)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT kb.content, 1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE kb.business_id = business_uuid
  ORDER BY kb.embedding <=> query_embedding LIMIT match_count;
END;
$$;


ALTER FUNCTION "public"."match_knowledge"("query_embedding" "public"."vector", "business_uuid" "uuid", "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_business_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT business_id FROM business_members WHERE user_id = auth.uid()
  UNION
  SELECT id FROM businesses WHERE owner_id = auth.uid()
$$;


ALTER FUNCTION "public"."user_business_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_is_business_admin"("p_business_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_members
    WHERE user_id = auth.uid() AND business_id = p_business_id
      AND role = ANY(ARRAY['owner','admin'])
  )
$$;


ALTER FUNCTION "public"."user_is_business_admin"("p_business_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."business_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "user_id" "uuid",
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "invited_email" "text",
    "invited_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "color" "text"
);


ALTER TABLE "public"."business_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "technician_id" "uuid",
    "call_id" "uuid",
    "type" "text" NOT NULL,
    "status" "text" DEFAULT 'booked'::"text" NOT NULL,
    "slot_start" timestamp with time zone NOT NULL,
    "slot_end" timestamp with time zone NOT NULL,
    "amount" numeric(10,2) DEFAULT 0,
    "notes" "text",
    "ai_notes" "text",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."jobs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."business_revenue_summary" AS
 SELECT "business_id",
    "date_trunc"('month'::"text", "created_at") AS "month",
    "sum"("amount") AS "total_revenue",
    "count"(*) AS "total_jobs",
    "count"(*) FILTER (WHERE ("source" = 'voice_agent'::"text")) AS "ai_captured_jobs",
    "sum"("amount") FILTER (WHERE ("source" = 'voice_agent'::"text")) AS "ai_captured_revenue"
   FROM "public"."jobs"
  WHERE ("status" <> 'canceled'::"text")
  GROUP BY "business_id", ("date_trunc"('month'::"text", "created_at"))
  ORDER BY ("date_trunc"('month'::"text", "created_at")) DESC;


ALTER VIEW "public"."business_revenue_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."businesses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "twilio_number" "text",
    "timezone" "text" DEFAULT 'America/New_York'::"text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "stripe_customer_id" "text",
    "subscription_status" "text" DEFAULT 'trialing'::"text" NOT NULL,
    "subscription_tier" "text" DEFAULT 'pro'::"text" NOT NULL,
    "trial_ends_at" timestamp with time zone,
    "google_review_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ai_sms_replies" boolean DEFAULT true,
    "review_platforms" "jsonb" DEFAULT '[]'::"jsonb",
    "system_prompt" "text",
    "monthly_call_count" integer DEFAULT 0,
    "usage_reset_at" timestamp with time zone DEFAULT ("now"() + '1 mon'::interval),
    "monthly_call_minutes" integer DEFAULT 0,
    "monthly_sms_count" integer DEFAULT 0,
    "override_call_cap" integer,
    "override_sms_cap" integer,
    "override_minutes_cap" integer
);


ALTER TABLE "public"."businesses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "twilio_call_sid" "text" NOT NULL,
    "caller_phone" "text" NOT NULL,
    "duration_seconds" integer DEFAULT 0,
    "recording_url" "text",
    "transcript" "text",
    "parsed_job" "jsonb" DEFAULT '{}'::"jsonb",
    "outcome" "text" DEFAULT 'in_progress'::"text" NOT NULL,
    "escalated" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "retell_call_id" "text"
);


ALTER TABLE "public"."calls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text",
    "phone" "text" NOT NULL,
    "email" "text",
    "address" "text",
    "notes" "text",
    "dissatisfied" boolean DEFAULT false NOT NULL,
    "sms_opted_out" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ai_sms_replies" boolean
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."demo_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slot_start" timestamp with time zone NOT NULL,
    "slot_end" timestamp with time zone NOT NULL,
    "booker_name" "text" NOT NULL,
    "booker_email" "text" NOT NULL,
    "booker_business" "text",
    "booker_phone" "text",
    "meet_link" "text",
    "calendar_event_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."demo_bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "name" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "file_size" integer,
    "status" "text" DEFAULT 'processing'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "folder_id" "uuid",
    "doc_type" "text",
    "deleted_at" timestamp with time zone,
    "page_count" integer,
    "job_id" "uuid"
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."embeddings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "embedding" "public"."vector",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "customer_id" "uuid"
);


ALTER TABLE "public"."embeddings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."intelligence_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "title" "text" DEFAULT 'New Chat'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."intelligence_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."intelligence_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "sources" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "intelligence_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text"])))
);


ALTER TABLE "public"."intelligence_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."library_folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."library_folders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."matter_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "contact_type" "text" DEFAULT 'Client'::"text" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "phone" "text",
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."matter_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "direction" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "body" "text" NOT NULL,
    "from_number" "text",
    "to_number" "text",
    "twilio_sid" "text",
    "read" boolean DEFAULT false,
    "sent_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "messages_channel_check" CHECK (("channel" = ANY (ARRAY['sms'::"text", 'email'::"text"]))),
    CONSTRAINT "messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"])))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "job_id" "uuid",
    "customer_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "body" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_log" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."open_quotes_with_sequence" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"uuid" AS "business_id",
    NULL::numeric(10,2) AS "amount",
    NULL::"text" AS "status",
    NULL::timestamp with time zone AS "sent_at",
    NULL::"text" AS "customer_name",
    NULL::"text" AS "customer_phone",
    NULL::bigint AS "touches_sent",
    NULL::bigint AS "touches_pending";


ALTER VIEW "public"."open_quotes_with_sequence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_features" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan" "text" NOT NULL,
    "monthly_call_cap" integer DEFAULT 50 NOT NULL,
    "monthly_sms_cap" integer DEFAULT 200 NOT NULL,
    "monthly_minutes_cap" integer DEFAULT 100 NOT NULL,
    "max_team_members" integer DEFAULT 1 NOT NULL,
    "intelligence" boolean DEFAULT false,
    "outbound_sequences" boolean DEFAULT false,
    "review_engine" boolean DEFAULT false,
    "smart_messaging" boolean DEFAULT true,
    "call_recordings" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "plan_features_plan_check" CHECK (("plan" = ANY (ARRAY['starter'::"text", 'pro'::"text", 'growth'::"text"])))
);


ALTER TABLE "public"."plan_features" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quote_touches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quote_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "touch_number" integer NOT NULL,
    "channel" "text" NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "sent_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL
);


ALTER TABLE "public"."quote_touches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "job_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "line_items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "declined_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."quotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "job_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone
);


ALTER TABLE "public"."review_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."technicians" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "color" "text" DEFAULT '#3B82F6'::"text" NOT NULL,
    "schedule" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."technicians" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trial_signups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "email" "text" NOT NULL,
    "phone" "text",
    "business_name" "text",
    "business_type" "text",
    "source" "text" DEFAULT 'marketing_site'::"text",
    "status" "text" DEFAULT 'signed_up'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "trial_signups_status_check" CHECK (("status" = ANY (ARRAY['signed_up'::"text", 'onboarding_started'::"text", 'onboarding_complete'::"text", 'churned'::"text"])))
);


ALTER TABLE "public"."trial_signups" OWNER TO "postgres";


ALTER TABLE ONLY "public"."business_members"
    ADD CONSTRAINT "business_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_twilio_number_key" UNIQUE ("twilio_number");



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_twilio_call_sid_key" UNIQUE ("twilio_call_sid");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_business_id_phone_key" UNIQUE ("business_id", "phone");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."demo_bookings"
    ADD CONSTRAINT "demo_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."embeddings"
    ADD CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."intelligence_conversations"
    ADD CONSTRAINT "intelligence_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."intelligence_messages"
    ADD CONSTRAINT "intelligence_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."library_folders"
    ADD CONSTRAINT "library_folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matter_contacts"
    ADD CONSTRAINT "matter_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_log"
    ADD CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_features"
    ADD CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_features"
    ADD CONSTRAINT "plan_features_plan_key" UNIQUE ("plan");



ALTER TABLE ONLY "public"."quote_touches"
    ADD CONSTRAINT "quote_touches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quote_touches"
    ADD CONSTRAINT "quote_touches_quote_id_touch_number_key" UNIQUE ("quote_id", "touch_number");



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_requests"
    ADD CONSTRAINT "review_requests_job_id_channel_key" UNIQUE ("job_id", "channel");



ALTER TABLE ONLY "public"."review_requests"
    ADD CONSTRAINT "review_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."technicians"
    ADD CONSTRAINT "technicians_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trial_signups"
    ADD CONSTRAINT "trial_signups_pkey" PRIMARY KEY ("id");



CREATE INDEX "embeddings_embedding_idx" ON "public"."embeddings" USING "hnsw" ((("embedding")::"public"."vector"(1536)) "public"."vector_cosine_ops");



CREATE INDEX "idx_businesses_owner_id" ON "public"."businesses" USING "btree" ("owner_id");



CREATE INDEX "idx_businesses_twilio" ON "public"."businesses" USING "btree" ("twilio_number");



CREATE INDEX "idx_calls_business_id" ON "public"."calls" USING "btree" ("business_id");



CREATE INDEX "idx_calls_created_at" ON "public"."calls" USING "btree" ("business_id", "created_at" DESC);



CREATE INDEX "idx_calls_customer_id" ON "public"."calls" USING "btree" ("customer_id");



CREATE INDEX "idx_calls_retell_call_id" ON "public"."calls" USING "btree" ("retell_call_id");



CREATE INDEX "idx_customers_business_id" ON "public"."customers" USING "btree" ("business_id");



CREATE INDEX "idx_customers_phone" ON "public"."customers" USING "btree" ("business_id", "phone");



CREATE INDEX "idx_jobs_business_id" ON "public"."jobs" USING "btree" ("business_id");



CREATE INDEX "idx_jobs_customer_id" ON "public"."jobs" USING "btree" ("customer_id");



CREATE UNIQUE INDEX "idx_jobs_slot_no_overlap" ON "public"."jobs" USING "btree" ("technician_id", "slot_start") WHERE ("status" <> 'canceled'::"text");



CREATE INDEX "idx_jobs_slot_start" ON "public"."jobs" USING "btree" ("business_id", "slot_start");



CREATE INDEX "idx_jobs_status" ON "public"."jobs" USING "btree" ("business_id", "status");



CREATE INDEX "idx_jobs_technician_id" ON "public"."jobs" USING "btree" ("technician_id");



CREATE INDEX "idx_messages_business_id" ON "public"."messages" USING "btree" ("business_id");



CREATE INDEX "idx_messages_customer_id" ON "public"."messages" USING "btree" ("customer_id");



CREATE INDEX "idx_messages_sent_at" ON "public"."messages" USING "btree" ("business_id", "sent_at" DESC);



CREATE INDEX "idx_notification_log_business_id" ON "public"."notification_log" USING "btree" ("business_id");



CREATE INDEX "idx_notification_log_customer_id" ON "public"."notification_log" USING "btree" ("customer_id");



CREATE INDEX "idx_notification_log_job_id" ON "public"."notification_log" USING "btree" ("job_id");



CREATE INDEX "idx_quote_touches_quote_id" ON "public"."quote_touches" USING "btree" ("quote_id");



CREATE INDEX "idx_quote_touches_scheduled" ON "public"."quote_touches" USING "btree" ("status", "scheduled_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_quotes_business_id" ON "public"."quotes" USING "btree" ("business_id");



CREATE INDEX "idx_quotes_job_id" ON "public"."quotes" USING "btree" ("job_id");



CREATE INDEX "idx_quotes_status" ON "public"."quotes" USING "btree" ("business_id", "status");



CREATE INDEX "idx_review_requests_business_id" ON "public"."review_requests" USING "btree" ("business_id");



CREATE INDEX "idx_review_requests_customer_id" ON "public"."review_requests" USING "btree" ("customer_id");



CREATE INDEX "idx_technicians_business_id" ON "public"."technicians" USING "btree" ("business_id");



CREATE UNIQUE INDEX "idx_trial_signups_email" ON "public"."trial_signups" USING "btree" ("email");



CREATE INDEX "intelligence_conversations_business_id_updated_at_idx" ON "public"."intelligence_conversations" USING "btree" ("business_id", "updated_at" DESC);



CREATE INDEX "intelligence_messages_conversation_id_created_at_idx" ON "public"."intelligence_messages" USING "btree" ("conversation_id", "created_at");



CREATE OR REPLACE VIEW "public"."open_quotes_with_sequence" AS
 SELECT "q"."id",
    "q"."business_id",
    "q"."amount",
    "q"."status",
    "q"."sent_at",
    "c"."name" AS "customer_name",
    "c"."phone" AS "customer_phone",
    "count"("qt"."id") FILTER (WHERE ("qt"."status" = 'sent'::"text")) AS "touches_sent",
    "count"("qt"."id") FILTER (WHERE ("qt"."status" = 'pending'::"text")) AS "touches_pending"
   FROM (("public"."quotes" "q"
     JOIN "public"."customers" "c" ON (("c"."id" = "q"."customer_id")))
     LEFT JOIN "public"."quote_touches" "qt" ON (("qt"."quote_id" = "q"."id")))
  WHERE ("q"."status" = 'sent'::"text")
  GROUP BY "q"."id", "c"."name", "c"."phone";



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."intelligence_conversations"
    ADD CONSTRAINT "intelligence_conversations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."intelligence_messages"
    ADD CONSTRAINT "intelligence_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."intelligence_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notification_log"
    ADD CONSTRAINT "notification_log_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_log"
    ADD CONSTRAINT "notification_log_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."notification_log"
    ADD CONSTRAINT "notification_log_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quote_touches"
    ADD CONSTRAINT "quote_touches_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quote_touches"
    ADD CONSTRAINT "quote_touches_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_requests"
    ADD CONSTRAINT "review_requests_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_requests"
    ADD CONSTRAINT "review_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."review_requests"
    ADD CONSTRAINT "review_requests_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."technicians"
    ADD CONSTRAINT "technicians_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



CREATE POLICY "Business owner access" ON "public"."messages" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



CREATE POLICY "business_access" ON "public"."documents" USING (("business_id" IN ( SELECT "public"."user_business_ids"() AS "user_business_ids")));



CREATE POLICY "business_access" ON "public"."embeddings" USING (("business_id" IN ( SELECT "public"."user_business_ids"() AS "user_business_ids")));



CREATE POLICY "business_access" ON "public"."library_folders" USING (("business_id" IN ( SELECT "public"."user_business_ids"() AS "user_business_ids")));



CREATE POLICY "business_access" ON "public"."matter_contacts" USING (("business_id" IN ( SELECT "public"."user_business_ids"() AS "user_business_ids")));



ALTER TABLE "public"."business_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."businesses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."embeddings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."library_folders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."matter_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "owner can manage their business" ON "public"."businesses" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "owner can manage their customers" ON "public"."customers" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"())))) WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



CREATE POLICY "owner can manage their jobs" ON "public"."jobs" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"())))) WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



CREATE POLICY "owner can manage their quotes" ON "public"."quotes" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"())))) WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



CREATE POLICY "owner can manage their technicians" ON "public"."technicians" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"())))) WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



CREATE POLICY "owner can view their calls" ON "public"."calls" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



CREATE POLICY "owner can view their notification log" ON "public"."notification_log" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



CREATE POLICY "owner can view their quote touches" ON "public"."quote_touches" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



CREATE POLICY "owner can view their review requests" ON "public"."review_requests" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



ALTER TABLE "public"."quote_touches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quotes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_role_full" ON "public"."business_members" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role_full" ON "public"."documents" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role_full" ON "public"."embeddings" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role_full" ON "public"."library_folders" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role_full" ON "public"."matter_contacts" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."technicians" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "view_own" ON "public"."business_members" FOR SELECT USING (("user_id" = "auth"."uid"()));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_business_limits"("p_business_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_business_limits"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_business_limits"("p_business_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_call_count"("p_business_id" "uuid", "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_call_count"("p_business_id" "uuid", "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_call_count"("p_business_id" "uuid", "p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_calls_by_day_of_week"("p_business_id" "uuid", "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_calls_by_day_of_week"("p_business_id" "uuid", "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_calls_by_day_of_week"("p_business_id" "uuid", "p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_calls_by_hour"("p_business_id" "uuid", "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_calls_by_hour"("p_business_id" "uuid", "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_calls_by_hour"("p_business_id" "uuid", "p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_calls_by_outcome"("p_business_id" "uuid", "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_calls_by_outcome"("p_business_id" "uuid", "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_calls_by_outcome"("p_business_id" "uuid", "p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_daily_call_counts"("p_business_id" "uuid", "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_daily_call_counts"("p_business_id" "uuid", "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_call_counts"("p_business_id" "uuid", "p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_seat_count"("p_business_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_seat_count"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_seat_count"("p_business_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_call_count"("p_business_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_call_count"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_call_count"("p_business_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_call_minutes"("p_business_id" "uuid", "p_minutes" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_call_minutes"("p_business_id" "uuid", "p_minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_call_minutes"("p_business_id" "uuid", "p_minutes" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_sms_count"("p_business_id" "uuid", "p_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_sms_count"("p_business_id" "uuid", "p_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_sms_count"("p_business_id" "uuid", "p_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."match_embeddings"("query_embedding" "public"."vector", "match_business_id" "uuid", "match_source_type" "text", "match_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."match_embeddings"("query_embedding" "public"."vector", "match_business_id" "uuid", "match_source_type" "text", "match_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_embeddings"("query_embedding" "public"."vector", "match_business_id" "uuid", "match_source_type" "text", "match_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."match_embeddings"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_business_id" "uuid", "p_customer_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."match_embeddings"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_business_id" "uuid", "p_customer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_embeddings"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_business_id" "uuid", "p_customer_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_knowledge"("query_embedding" "public"."vector", "business_uuid" "uuid", "match_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."match_knowledge"("query_embedding" "public"."vector", "business_uuid" "uuid", "match_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_knowledge"("query_embedding" "public"."vector", "business_uuid" "uuid", "match_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."user_business_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."user_business_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_business_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_is_business_admin"("p_business_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_is_business_admin"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_is_business_admin"("p_business_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."business_members" TO "anon";
GRANT ALL ON TABLE "public"."business_members" TO "authenticated";
GRANT ALL ON TABLE "public"."business_members" TO "service_role";



GRANT ALL ON TABLE "public"."jobs" TO "anon";
GRANT ALL ON TABLE "public"."jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs" TO "service_role";



GRANT ALL ON TABLE "public"."business_revenue_summary" TO "anon";
GRANT ALL ON TABLE "public"."business_revenue_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."business_revenue_summary" TO "service_role";



GRANT ALL ON TABLE "public"."businesses" TO "anon";
GRANT ALL ON TABLE "public"."businesses" TO "authenticated";
GRANT ALL ON TABLE "public"."businesses" TO "service_role";



GRANT ALL ON TABLE "public"."calls" TO "anon";
GRANT ALL ON TABLE "public"."calls" TO "authenticated";
GRANT ALL ON TABLE "public"."calls" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."demo_bookings" TO "anon";
GRANT ALL ON TABLE "public"."demo_bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."demo_bookings" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."embeddings" TO "anon";
GRANT ALL ON TABLE "public"."embeddings" TO "authenticated";
GRANT ALL ON TABLE "public"."embeddings" TO "service_role";



GRANT ALL ON TABLE "public"."intelligence_conversations" TO "anon";
GRANT ALL ON TABLE "public"."intelligence_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."intelligence_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."intelligence_messages" TO "anon";
GRANT ALL ON TABLE "public"."intelligence_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."intelligence_messages" TO "service_role";



GRANT ALL ON TABLE "public"."library_folders" TO "anon";
GRANT ALL ON TABLE "public"."library_folders" TO "authenticated";
GRANT ALL ON TABLE "public"."library_folders" TO "service_role";



GRANT ALL ON TABLE "public"."matter_contacts" TO "anon";
GRANT ALL ON TABLE "public"."matter_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."matter_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notification_log" TO "anon";
GRANT ALL ON TABLE "public"."notification_log" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_log" TO "service_role";



GRANT ALL ON TABLE "public"."open_quotes_with_sequence" TO "anon";
GRANT ALL ON TABLE "public"."open_quotes_with_sequence" TO "authenticated";
GRANT ALL ON TABLE "public"."open_quotes_with_sequence" TO "service_role";



GRANT ALL ON TABLE "public"."plan_features" TO "anon";
GRANT ALL ON TABLE "public"."plan_features" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_features" TO "service_role";



GRANT ALL ON TABLE "public"."quote_touches" TO "anon";
GRANT ALL ON TABLE "public"."quote_touches" TO "authenticated";
GRANT ALL ON TABLE "public"."quote_touches" TO "service_role";



GRANT ALL ON TABLE "public"."quotes" TO "anon";
GRANT ALL ON TABLE "public"."quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."quotes" TO "service_role";



GRANT ALL ON TABLE "public"."review_requests" TO "anon";
GRANT ALL ON TABLE "public"."review_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."review_requests" TO "service_role";



GRANT ALL ON TABLE "public"."technicians" TO "anon";
GRANT ALL ON TABLE "public"."technicians" TO "authenticated";
GRANT ALL ON TABLE "public"."technicians" TO "service_role";



GRANT ALL ON TABLE "public"."trial_signups" TO "anon";
GRANT ALL ON TABLE "public"."trial_signups" TO "authenticated";
GRANT ALL ON TABLE "public"."trial_signups" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







