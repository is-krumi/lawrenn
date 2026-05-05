# RennOps SQL Reference

> Quick reference for common Supabase queries. Run in **Supabase → SQL Editor**.
> Test business ID: `3dd98630-736a-4391-a0e6-ddc39495ff8d`

---

## 🏢 Business & Settings

### View

```sql
-- Full business record
SELECT * FROM businesses WHERE id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';

-- Services
SELECT settings->'services' FROM businesses WHERE id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';

-- Operating hours
SELECT settings->'operating_hours' FROM businesses WHERE id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';

-- AI persona
SELECT settings->'ai_persona' FROM businesses WHERE id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';

-- System prompt
SELECT system_prompt FROM businesses WHERE id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';

-- First 300 chars of system prompt
SELECT substring(system_prompt, 1, 300) FROM businesses WHERE id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';
```

### Update

```sql
-- Services
UPDATE businesses
SET settings = jsonb_set(settings, '{services}', '[
  {"name": "Service Name", "duration_mins": 60, "description": "Description here"}
]'::jsonb)
WHERE id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';

-- Operating hours
UPDATE businesses
SET settings = jsonb_set(settings, '{operating_hours}', '{
  "mon": {"start": "08:00", "end": "17:00"},
  "tue": {"start": "08:00", "end": "17:00"},
  "wed": {"start": "08:00", "end": "17:00"},
  "thu": {"start": "08:00", "end": "17:00"},
  "fri": {"start": "08:00", "end": "17:00"},
  "sat": null, "sun": null
}'::jsonb)
WHERE id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';

-- AI persona
UPDATE businesses
SET settings = jsonb_set(settings, '{ai_persona}', '{
  "name": "Alex",
  "greeting": "Thanks for calling"
}'::jsonb)
WHERE id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';

-- Review delay
UPDATE businesses
SET settings = jsonb_set(settings, '{review_delay_hrs}', '2')
WHERE id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';

-- Travel buffer
UPDATE businesses
SET settings = jsonb_set(settings, '{travel_buffer_mins}', '30')
WHERE id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';

-- System prompt
UPDATE businesses SET system_prompt = 'Your prompt here...'
WHERE id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';

-- Google review URL
UPDATE businesses SET google_review_url = 'https://g.page/r/your-link'
WHERE id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';

-- AI SMS replies
UPDATE businesses SET ai_sms_replies = true
WHERE id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';

-- Twilio number
UPDATE businesses SET twilio_number = '+1XXXXXXXXXX'
WHERE id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';

-- Subscription
UPDATE businesses SET subscription_status = 'active', subscription_tier = 'pro'
WHERE id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';
```

---

## 👷 Technicians

```sql
-- View all technicians
SELECT * FROM technicians WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';

-- View schedule
SELECT name, schedule FROM technicians WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';

-- Update schedule
UPDATE technicians
SET schedule = '{
  "mon": {"start": "08:00", "end": "17:00"},
  "tue": {"start": "08:00", "end": "17:00"},
  "wed": {"start": "08:00", "end": "17:00"},
  "thu": {"start": "08:00", "end": "17:00"},
  "fri": {"start": "08:00", "end": "17:00"},
  "sat": null, "sun": null
}'::jsonb
WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';

-- Add technician
INSERT INTO technicians (business_id, name, phone, color, active, schedule)
VALUES (
  '3dd98630-736a-4391-a0e6-ddc39495ff8d',
  'James',
  '+17165550100',
  '#0cc0df',
  true,
  '{"mon":{"start":"08:00","end":"17:00"},"tue":{"start":"08:00","end":"17:00"},"wed":{"start":"08:00","end":"17:00"},"thu":{"start":"08:00","end":"17:00"},"fri":{"start":"08:00","end":"17:00"},"sat":null,"sun":null}'
);

-- Deactivate technician
UPDATE technicians SET active = false WHERE id = 'TECH_ID';
```

---

## 📞 Calls

```sql
-- Recent calls
SELECT id, caller_phone, outcome, escalated, created_at
FROM calls
WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d'
ORDER BY created_at DESC LIMIT 20;

-- Calls by outcome
SELECT outcome, COUNT(*) FROM calls
WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d'
GROUP BY outcome;

-- Escalated calls
SELECT * FROM calls
WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d'
AND escalated = true
ORDER BY created_at DESC;

-- Calls with transcripts
SELECT caller_phone, outcome, transcript, ai_notes, created_at
FROM calls
WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d'
AND transcript IS NOT NULL
ORDER BY created_at DESC LIMIT 10;
```

---

## 🔧 Jobs

```sql
-- All jobs with customer info
SELECT j.id, c.name, c.phone, j.type, j.status, j.slot_start, j.slot_end
FROM jobs j
LEFT JOIN customers c ON c.id = j.customer_id
WHERE j.business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d'
ORDER BY j.slot_start DESC;

-- Upcoming jobs
SELECT j.id, c.name, j.type, j.status, j.slot_start
FROM jobs j
LEFT JOIN customers c ON c.id = j.customer_id
WHERE j.business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d'
AND j.slot_start > now()
ORDER BY j.slot_start ASC;

-- Jobs by status
SELECT status, COUNT(*) FROM jobs
WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d'
GROUP BY status;

-- Update job status
UPDATE jobs SET status = 'complete', completed_at = now()
WHERE id = 'JOB_ID';

-- Delete all test jobs
DELETE FROM jobs WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';
```

---

## 👥 Customers

```sql
-- All customers
SELECT * FROM customers
WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d'
ORDER BY created_at DESC;

-- Opted out customers
SELECT name, phone FROM customers
WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d'
AND sms_opted_out = true;

-- Opt customer back in
UPDATE customers SET sms_opted_out = false
WHERE phone = '+1XXXXXXXXXX'
AND business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';

-- Delete all test data (safe order)
DELETE FROM notification_log WHERE customer_id IN (
  SELECT id FROM customers WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d'
);
DELETE FROM messages WHERE customer_id IN (
  SELECT id FROM customers WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d'
);
DELETE FROM jobs WHERE customer_id IN (
  SELECT id FROM customers WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d'
);
DELETE FROM customers WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';
```

---

## 💬 Messages

```sql
-- Recent messages
SELECT direction, body, sent_at FROM messages
WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d'
ORDER BY sent_at DESC LIMIT 20;

-- Unread messages
SELECT * FROM messages
WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d'
AND direction = 'inbound' AND read = false;

-- Mark all as read
UPDATE messages SET read = true
WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d'
AND read = false;
```

---

## 🔔 Notifications & Reviews

```sql
-- Notification log
SELECT type, channel, body, sent_at FROM notification_log
WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d'
ORDER BY sent_at DESC LIMIT 20;

-- Review requests
SELECT * FROM review_requests
WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d'
ORDER BY created_at DESC;

-- Delete review request (to re-test)
DELETE FROM review_requests WHERE job_id = 'JOB_ID';
```

---

## 🧠 Embeddings

```sql
-- Count by source type
SELECT source_type, COUNT(*) FROM embeddings
WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d'
GROUP BY source_type;

-- Delete all embeddings
DELETE FROM embeddings
WHERE business_id = '3dd98630-736a-4391-a0e6-ddc39495ff8d';
```

---

## 📅 Demo Bookings

```sql
-- All demo bookings
SELECT booker_name, booker_email, booker_business, slot_start, meet_link, created_at
FROM demo_bookings
ORDER BY created_at DESC;

-- Delete booking
DELETE FROM demo_bookings WHERE id = 'BOOKING_ID';
```

---

## 🚫 Unsubscribes

```sql
-- View all
SELECT * FROM cold_outreach_unsubscribes ORDER BY created_at DESC;

-- Check specific email
SELECT * FROM cold_outreach_unsubscribes WHERE email = 'test@test.com';

-- Remove from list
DELETE FROM cold_outreach_unsubscribes WHERE email = 'test@test.com';
```

---

## 🆕 Onboarding — New Business Setup

```sql
-- Step 1: Find user ID
SELECT id FROM auth.users WHERE email = 'owner@business.com';

-- Step 2: Insert business
INSERT INTO businesses (
  owner_id, name, phone, timezone, twilio_number,
  subscription_status, subscription_tier, trial_ends_at,
  settings
) VALUES (
  'USER_ID',
  'Business Name',
  '+1XXXXXXXXXX',
  'America/New_York',
  '+1XXXXXXXXXX',
  'trialing',
  'pro',
  now() + interval '14 days',
  '{
    "services": [{"name": "Service Name", "duration_mins": 120}],
    "operating_hours": {
      "mon": {"start": "08:00", "end": "17:00"},
      "tue": {"start": "08:00", "end": "17:00"},
      "wed": {"start": "08:00", "end": "17:00"},
      "thu": {"start": "08:00", "end": "17:00"},
      "fri": {"start": "08:00", "end": "17:00"},
      "sat": null, "sun": null
    },
    "ai_persona": {"name": "Alex", "greeting": "Thanks for calling"},
    "travel_buffer_mins": 30,
    "review_delay_hrs": 2
  }'::jsonb
);

-- Step 3: Get new business ID
SELECT id FROM businesses WHERE owner_id = 'USER_ID';

-- Step 4: Insert technician
INSERT INTO technicians (business_id, name, phone, color, active, schedule)
VALUES (
  'BUSINESS_ID',
  'Owner Name',
  '+1XXXXXXXXXX',
  '#0cc0df',
  true,
  '{"mon":{"start":"08:00","end":"17:00"},"tue":{"start":"08:00","end":"17:00"},"wed":{"start":"08:00","end":"17:00"},"thu":{"start":"08:00","end":"17:00"},"fri":{"start":"08:00","end":"17:00"},"sat":null,"sun":null}'
);

-- Step 5: Set Twilio number
UPDATE businesses SET twilio_number = '+1XXXXXXXXXX' WHERE id = 'BUSINESS_ID';

-- Step 6: Add to 10DLC campaign in Twilio Console (manual)
```

---

## 🔍 Useful Diagnostics

```sql
-- All businesses and their status
SELECT id, name, twilio_number, subscription_status, subscription_tier, trial_ends_at
FROM businesses ORDER BY created_at DESC;

-- Businesses with empty services
SELECT id, name FROM businesses
WHERE settings->'services' = '[]'::jsonb OR settings->'services' IS NULL;

-- Businesses with no technicians
SELECT b.id, b.name FROM businesses b
LEFT JOIN technicians t ON t.business_id = b.id
WHERE t.id IS NULL;

-- Call volume by business
SELECT b.name, COUNT(c.id) as total_calls
FROM businesses b
LEFT JOIN calls c ON c.business_id = b.id
GROUP BY b.name ORDER BY total_calls DESC;

-- SMS volume by business
SELECT b.name, COUNT(m.id) as total_messages
FROM businesses b
LEFT JOIN messages m ON m.business_id = b.id
GROUP BY b.name ORDER BY total_messages DESC;

-- Revenue by subscription tier
SELECT subscription_tier, COUNT(*) as businesses,
  CASE subscription_tier
    WHEN 'starter' THEN COUNT(*) * 199
    WHEN 'pro'     THEN COUNT(*) * 299
    WHEN 'growth'  THEN COUNT(*) * 449
  END as mrr
FROM businesses
WHERE subscription_status = 'active'
GROUP BY subscription_tier;
```

---

## ⚡ Schema Cache Refresh

```sql
-- Force Supabase to reload schema (run after ALTER TABLE)
NOTIFY pgrst, 'reload schema';
```
