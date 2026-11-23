
ALTER TABLE public.product_reminders
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_action_date date;

UPDATE public.product_reminders
  SET completed_at = resolved_at
  WHERE completed_at IS NULL
    AND resolved_at IS NOT NULL
    AND status IN ('purchased_again','not_interested','do_not_remind');
