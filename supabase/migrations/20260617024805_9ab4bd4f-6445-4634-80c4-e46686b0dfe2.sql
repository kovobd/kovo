
ALTER TYPE public.reminder_status ADD VALUE IF NOT EXISTS 'interested';
ALTER TABLE public.product_reminders ADD COLUMN IF NOT EXISTS expected_purchase_date date;
