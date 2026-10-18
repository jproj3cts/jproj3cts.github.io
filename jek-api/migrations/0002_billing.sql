-- Billing details mirrored from Stripe, and academic verification.

-- 'month' or 'year'; when a cancelled subscription ends; when a failed
-- payment started the 7 days' grace (Stripe moves period_end on at renewal,
-- so grace cannot be counted from it).
ALTER TABLE subscriptions ADD COLUMN interval TEXT;
ALTER TABLE subscriptions ADD COLUMN cancel_at INTEGER;
ALTER TABLE subscriptions ADD COLUMN past_due_since INTEGER;

-- Academic price: verified until, and how (an email domain or ORCID).
ALTER TABLE users ADD COLUMN academic_until INTEGER;
ALTER TABLE users ADD COLUMN academic_via TEXT;
