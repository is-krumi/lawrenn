--
-- PostgreSQL database dump
--

\restrict sGagwPGIJ0a8mtCvTdCwk78RxY6Z6xMYV1VgVL2nezIwG7N00EiaQiuK89nKILE

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: get_business_limits(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_business_limits(p_business_id uuid) RETURNS TABLE(monthly_call_cap integer, monthly_sms_cap integer, monthly_minutes_cap integer, max_team_members integer, intelligence boolean, outbound_sequences boolean, review_engine boolean, smart_messaging boolean, call_recordings boolean)
    LANGUAGE sql STABLE
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


--
-- Name: get_call_count(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_call_count(p_business_id uuid, p_days integer) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  SELECT COUNT(*)::int FROM calls
  WHERE business_id = p_business_id
  AND created_at >= now() - (p_days || ' days')::interval;
$$;


--
-- Name: get_calls_by_day_of_week(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_calls_by_day_of_week(p_business_id uuid, p_days integer) RETURNS TABLE(day_name text, call_count integer)
    LANGUAGE sql STABLE
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


--
-- Name: get_calls_by_hour(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_calls_by_hour(p_business_id uuid, p_days integer) RETURNS TABLE(hour_of_day integer, call_count integer)
    LANGUAGE sql STABLE
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


--
-- Name: get_calls_by_outcome(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_calls_by_outcome(p_business_id uuid, p_days integer) RETURNS TABLE(outcome text, call_count integer)
    LANGUAGE sql STABLE
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


--
-- Name: get_daily_call_counts(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_daily_call_counts(p_business_id uuid, p_days integer) RETURNS TABLE(call_date text, call_count integer)
    LANGUAGE sql STABLE
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


--
-- Name: increment_call_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_call_count(p_business_id uuid) RETURNS void
    LANGUAGE plpgsql
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


--
-- Name: increment_call_minutes(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_call_minutes(p_business_id uuid, p_minutes integer) RETURNS void
    LANGUAGE plpgsql
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


--
-- Name: increment_sms_count(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_sms_count(p_business_id uuid, p_count integer DEFAULT 1) RETURNS void
    LANGUAGE plpgsql
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


--
-- Name: match_call_embeddings(public.vector, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_call_embeddings(query_embedding public.vector, match_business_id uuid, match_count integer DEFAULT 5) RETURNS TABLE(call_id uuid, content text, similarity double precision)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    call_id,
    content,
    1 - (embedding <=> query_embedding) AS similarity
  FROM call_embeddings
  WHERE business_id = match_business_id
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;


--
-- Name: match_embeddings(public.vector, uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_embeddings(query_embedding public.vector, match_business_id uuid, match_source_type text DEFAULT NULL::text, match_count integer DEFAULT 8) RETURNS TABLE(source_type text, source_id uuid, content text, similarity double precision)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    source_type,
    source_id,
    content,
    1 - (embedding <=> query_embedding) AS similarity
  FROM embeddings
  WHERE business_id = match_business_id
    AND (match_source_type IS NULL OR source_type = match_source_type)
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;


--
-- Name: match_knowledge(public.vector, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_knowledge(query_embedding public.vector, business_uuid uuid, match_count integer DEFAULT 3) RETURNS TABLE(content text, similarity double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.content,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE kb.business_id = business_uuid
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    technician_id uuid,
    call_id uuid,
    type text NOT NULL,
    status text DEFAULT 'booked'::text NOT NULL,
    slot_start timestamp with time zone NOT NULL,
    slot_end timestamp with time zone NOT NULL,
    amount numeric(10,2) DEFAULT 0,
    notes text,
    ai_notes text,
    source text DEFAULT 'manual'::text NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: business_revenue_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.business_revenue_summary AS
 SELECT business_id,
    date_trunc('month'::text, created_at) AS month,
    sum(amount) AS total_revenue,
    count(*) AS total_jobs,
    count(*) FILTER (WHERE (source = 'voice_agent'::text)) AS ai_captured_jobs,
    sum(amount) FILTER (WHERE (source = 'voice_agent'::text)) AS ai_captured_revenue
   FROM public.jobs
  WHERE (status <> 'canceled'::text)
  GROUP BY business_id, (date_trunc('month'::text, created_at))
  ORDER BY (date_trunc('month'::text, created_at)) DESC;


--
-- Name: businesses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.businesses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    phone text,
    twilio_number text,
    timezone text DEFAULT 'America/New_York'::text NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    stripe_customer_id text,
    subscription_status text DEFAULT 'trialing'::text NOT NULL,
    subscription_tier text DEFAULT 'pro'::text NOT NULL,
    trial_ends_at timestamp with time zone,
    google_review_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ai_sms_replies boolean DEFAULT true,
    review_platforms jsonb DEFAULT '[]'::jsonb,
    system_prompt text,
    monthly_call_count integer DEFAULT 0,
    usage_reset_at timestamp with time zone DEFAULT (now() + '1 mon'::interval),
    monthly_call_minutes integer DEFAULT 0,
    monthly_sms_count integer DEFAULT 0,
    override_call_cap integer,
    override_sms_cap integer,
    override_minutes_cap integer
);


--
-- Name: calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    customer_id uuid,
    twilio_call_sid text NOT NULL,
    caller_phone text NOT NULL,
    duration_seconds integer DEFAULT 0,
    recording_url text,
    transcript text,
    parsed_job jsonb DEFAULT '{}'::jsonb,
    outcome text DEFAULT 'in_progress'::text NOT NULL,
    escalated boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    retell_call_id text
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text,
    phone text NOT NULL,
    email text,
    address text,
    notes text,
    dissatisfied boolean DEFAULT false NOT NULL,
    sms_opted_out boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ai_sms_replies boolean
);


--
-- Name: demo_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demo_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slot_start timestamp with time zone NOT NULL,
    slot_end timestamp with time zone NOT NULL,
    booker_name text NOT NULL,
    booker_email text NOT NULL,
    booker_business text,
    booker_phone text,
    meet_link text,
    calendar_event_id text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    source_type text NOT NULL,
    source_id uuid NOT NULL,
    content text NOT NULL,
    embedding public.vector(1536),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT embeddings_source_type_check CHECK ((source_type = ANY (ARRAY['call'::text, 'message'::text, 'job'::text])))
);


--
-- Name: intelligence_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.intelligence_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    title text DEFAULT 'New Chat'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: intelligence_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.intelligence_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    business_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    sources jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT intelligence_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    customer_id uuid,
    direction text NOT NULL,
    channel text NOT NULL,
    body text NOT NULL,
    from_number text,
    to_number text,
    twilio_sid text,
    read boolean DEFAULT false,
    sent_at timestamp with time zone DEFAULT now(),
    CONSTRAINT messages_channel_check CHECK ((channel = ANY (ARRAY['sms'::text, 'email'::text]))),
    CONSTRAINT messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])))
);


--
-- Name: notification_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    job_id uuid,
    customer_id uuid NOT NULL,
    type text NOT NULL,
    channel text NOT NULL,
    body text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: open_quotes_with_sequence; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.open_quotes_with_sequence AS
SELECT
    NULL::uuid AS id,
    NULL::uuid AS business_id,
    NULL::numeric(10,2) AS amount,
    NULL::text AS status,
    NULL::timestamp with time zone AS sent_at,
    NULL::text AS customer_name,
    NULL::text AS customer_phone,
    NULL::bigint AS touches_sent,
    NULL::bigint AS touches_pending;


--
-- Name: plan_features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_features (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan text NOT NULL,
    monthly_call_cap integer DEFAULT 50 NOT NULL,
    monthly_sms_cap integer DEFAULT 200 NOT NULL,
    monthly_minutes_cap integer DEFAULT 100 NOT NULL,
    max_team_members integer DEFAULT 1 NOT NULL,
    intelligence boolean DEFAULT false,
    outbound_sequences boolean DEFAULT false,
    review_engine boolean DEFAULT false,
    smart_messaging boolean DEFAULT true,
    call_recordings boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT plan_features_plan_check CHECK ((plan = ANY (ARRAY['starter'::text, 'pro'::text, 'growth'::text])))
);


--
-- Name: quote_touches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quote_touches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quote_id uuid NOT NULL,
    business_id uuid NOT NULL,
    touch_number integer NOT NULL,
    channel text NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    sent_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL
);


--
-- Name: quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    job_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    line_items jsonb DEFAULT '[]'::jsonb NOT NULL,
    amount numeric(10,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    sent_at timestamp with time zone,
    accepted_at timestamp with time zone,
    declined_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: review_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    job_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    channel text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone
);


--
-- Name: technicians; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.technicians (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text NOT NULL,
    phone text,
    color text DEFAULT '#3B82F6'::text NOT NULL,
    schedule jsonb DEFAULT '{}'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trial_signups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trial_signups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    email text NOT NULL,
    phone text,
    business_name text,
    business_type text,
    source text DEFAULT 'marketing_site'::text,
    status text DEFAULT 'signed_up'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT trial_signups_status_check CHECK ((status = ANY (ARRAY['signed_up'::text, 'onboarding_started'::text, 'onboarding_complete'::text, 'churned'::text])))
);


--
-- Name: businesses businesses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_pkey PRIMARY KEY (id);


--
-- Name: businesses businesses_stripe_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_stripe_customer_id_key UNIQUE (stripe_customer_id);


--
-- Name: businesses businesses_twilio_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_twilio_number_key UNIQUE (twilio_number);


--
-- Name: calls calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_pkey PRIMARY KEY (id);


--
-- Name: calls calls_twilio_call_sid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_twilio_call_sid_key UNIQUE (twilio_call_sid);


--
-- Name: customers customers_business_id_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_business_id_phone_key UNIQUE (business_id, phone);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: demo_bookings demo_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_bookings
    ADD CONSTRAINT demo_bookings_pkey PRIMARY KEY (id);


--
-- Name: embeddings embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embeddings
    ADD CONSTRAINT embeddings_pkey PRIMARY KEY (id);


--
-- Name: intelligence_conversations intelligence_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intelligence_conversations
    ADD CONSTRAINT intelligence_conversations_pkey PRIMARY KEY (id);


--
-- Name: intelligence_messages intelligence_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intelligence_messages
    ADD CONSTRAINT intelligence_messages_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notification_log notification_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_pkey PRIMARY KEY (id);


--
-- Name: plan_features plan_features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_features
    ADD CONSTRAINT plan_features_pkey PRIMARY KEY (id);


--
-- Name: plan_features plan_features_plan_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_features
    ADD CONSTRAINT plan_features_plan_key UNIQUE (plan);


--
-- Name: quote_touches quote_touches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_touches
    ADD CONSTRAINT quote_touches_pkey PRIMARY KEY (id);


--
-- Name: quote_touches quote_touches_quote_id_touch_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_touches
    ADD CONSTRAINT quote_touches_quote_id_touch_number_key UNIQUE (quote_id, touch_number);


--
-- Name: quotes quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_pkey PRIMARY KEY (id);


--
-- Name: review_requests review_requests_job_id_channel_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_requests
    ADD CONSTRAINT review_requests_job_id_channel_key UNIQUE (job_id, channel);


--
-- Name: review_requests review_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_requests
    ADD CONSTRAINT review_requests_pkey PRIMARY KEY (id);


--
-- Name: technicians technicians_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technicians
    ADD CONSTRAINT technicians_pkey PRIMARY KEY (id);


--
-- Name: trial_signups trial_signups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_signups
    ADD CONSTRAINT trial_signups_pkey PRIMARY KEY (id);


--
-- Name: idx_businesses_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_owner_id ON public.businesses USING btree (owner_id);


--
-- Name: idx_businesses_twilio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_twilio ON public.businesses USING btree (twilio_number);


--
-- Name: idx_calls_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_business_id ON public.calls USING btree (business_id);


--
-- Name: idx_calls_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_created_at ON public.calls USING btree (business_id, created_at DESC);


--
-- Name: idx_calls_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_customer_id ON public.calls USING btree (customer_id);


--
-- Name: idx_calls_retell_call_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_retell_call_id ON public.calls USING btree (retell_call_id);


--
-- Name: idx_customers_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_business_id ON public.customers USING btree (business_id);


--
-- Name: idx_customers_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_phone ON public.customers USING btree (business_id, phone);


--
-- Name: idx_embeddings_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_embeddings_business ON public.embeddings USING btree (business_id);


--
-- Name: idx_embeddings_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_embeddings_source ON public.embeddings USING btree (business_id, source_type);


--
-- Name: idx_embeddings_vector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_embeddings_vector ON public.embeddings USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');


--
-- Name: idx_jobs_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_business_id ON public.jobs USING btree (business_id);


--
-- Name: idx_jobs_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_customer_id ON public.jobs USING btree (customer_id);


--
-- Name: idx_jobs_slot_no_overlap; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_jobs_slot_no_overlap ON public.jobs USING btree (technician_id, slot_start) WHERE (status <> 'canceled'::text);


--
-- Name: idx_jobs_slot_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_slot_start ON public.jobs USING btree (business_id, slot_start);


--
-- Name: idx_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_status ON public.jobs USING btree (business_id, status);


--
-- Name: idx_jobs_technician_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_technician_id ON public.jobs USING btree (technician_id);


--
-- Name: idx_messages_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_business_id ON public.messages USING btree (business_id);


--
-- Name: idx_messages_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_customer_id ON public.messages USING btree (customer_id);


--
-- Name: idx_messages_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_sent_at ON public.messages USING btree (business_id, sent_at DESC);


--
-- Name: idx_notification_log_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_log_business_id ON public.notification_log USING btree (business_id);


--
-- Name: idx_notification_log_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_log_customer_id ON public.notification_log USING btree (customer_id);


--
-- Name: idx_notification_log_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_log_job_id ON public.notification_log USING btree (job_id);


--
-- Name: idx_quote_touches_quote_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quote_touches_quote_id ON public.quote_touches USING btree (quote_id);


--
-- Name: idx_quote_touches_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quote_touches_scheduled ON public.quote_touches USING btree (status, scheduled_at) WHERE (status = 'pending'::text);


--
-- Name: idx_quotes_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotes_business_id ON public.quotes USING btree (business_id);


--
-- Name: idx_quotes_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotes_job_id ON public.quotes USING btree (job_id);


--
-- Name: idx_quotes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotes_status ON public.quotes USING btree (business_id, status);


--
-- Name: idx_review_requests_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_requests_business_id ON public.review_requests USING btree (business_id);


--
-- Name: idx_review_requests_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_requests_customer_id ON public.review_requests USING btree (customer_id);


--
-- Name: idx_technicians_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technicians_business_id ON public.technicians USING btree (business_id);


--
-- Name: idx_trial_signups_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_trial_signups_email ON public.trial_signups USING btree (email);


--
-- Name: intelligence_conversations_business_id_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX intelligence_conversations_business_id_updated_at_idx ON public.intelligence_conversations USING btree (business_id, updated_at DESC);


--
-- Name: intelligence_messages_conversation_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX intelligence_messages_conversation_id_created_at_idx ON public.intelligence_messages USING btree (conversation_id, created_at);


--
-- Name: open_quotes_with_sequence _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.open_quotes_with_sequence AS
 SELECT q.id,
    q.business_id,
    q.amount,
    q.status,
    q.sent_at,
    c.name AS customer_name,
    c.phone AS customer_phone,
    count(qt.id) FILTER (WHERE (qt.status = 'sent'::text)) AS touches_sent,
    count(qt.id) FILTER (WHERE (qt.status = 'pending'::text)) AS touches_pending
   FROM ((public.quotes q
     JOIN public.customers c ON ((c.id = q.customer_id)))
     LEFT JOIN public.quote_touches qt ON ((qt.quote_id = q.id)))
  WHERE (q.status = 'sent'::text)
  GROUP BY q.id, c.name, c.phone;


--
-- Name: businesses businesses_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: calls calls_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: calls calls_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: customers customers_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: embeddings embeddings_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embeddings
    ADD CONSTRAINT embeddings_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: intelligence_conversations intelligence_conversations_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intelligence_conversations
    ADD CONSTRAINT intelligence_conversations_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: intelligence_messages intelligence_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intelligence_messages
    ADD CONSTRAINT intelligence_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.intelligence_conversations(id) ON DELETE CASCADE;


--
-- Name: jobs jobs_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: jobs jobs_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.calls(id) ON DELETE SET NULL;


--
-- Name: jobs jobs_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: jobs jobs_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.technicians(id) ON DELETE SET NULL;


--
-- Name: messages messages_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: messages messages_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: notification_log notification_log_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: notification_log notification_log_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: notification_log notification_log_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;


--
-- Name: quote_touches quote_touches_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_touches
    ADD CONSTRAINT quote_touches_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: quote_touches quote_touches_quote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_touches
    ADD CONSTRAINT quote_touches_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE CASCADE;


--
-- Name: quotes quotes_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: quotes quotes_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: quotes quotes_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: review_requests review_requests_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_requests
    ADD CONSTRAINT review_requests_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: review_requests review_requests_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_requests
    ADD CONSTRAINT review_requests_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: review_requests review_requests_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_requests
    ADD CONSTRAINT review_requests_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: technicians technicians_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technicians
    ADD CONSTRAINT technicians_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: embeddings Business owner access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Business owner access" ON public.embeddings USING ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid()))));


--
-- Name: messages Business owner access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Business owner access" ON public.messages USING ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid()))));


--
-- Name: businesses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

--
-- Name: calls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: embeddings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.embeddings ENABLE ROW LEVEL SECURITY;

--
-- Name: jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

--
-- Name: businesses owner can manage their business; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner can manage their business" ON public.businesses USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));


--
-- Name: customers owner can manage their customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner can manage their customers" ON public.customers USING ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid())))) WITH CHECK ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid()))));


--
-- Name: jobs owner can manage their jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner can manage their jobs" ON public.jobs USING ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid())))) WITH CHECK ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid()))));


--
-- Name: quotes owner can manage their quotes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner can manage their quotes" ON public.quotes USING ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid())))) WITH CHECK ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid()))));


--
-- Name: technicians owner can manage their technicians; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner can manage their technicians" ON public.technicians USING ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid())))) WITH CHECK ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid()))));


--
-- Name: calls owner can view their calls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner can view their calls" ON public.calls USING ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid()))));


--
-- Name: notification_log owner can view their notification log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner can view their notification log" ON public.notification_log USING ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid()))));


--
-- Name: quote_touches owner can view their quote touches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner can view their quote touches" ON public.quote_touches USING ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid()))));


--
-- Name: review_requests owner can view their review requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner can view their review requests" ON public.review_requests USING ((business_id IN ( SELECT businesses.id
   FROM public.businesses
  WHERE (businesses.owner_id = auth.uid()))));


--
-- Name: quote_touches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quote_touches ENABLE ROW LEVEL SECURITY;

--
-- Name: quotes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

--
-- Name: review_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: technicians; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict sGagwPGIJ0a8mtCvTdCwk78RxY6Z6xMYV1VgVL2nezIwG7N00EiaQiuK89nKILE

