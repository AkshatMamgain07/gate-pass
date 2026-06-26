-- ============================================================
-- Gate Pass System — Migration v2
-- Run this in Supabase SQL Editor (Project > SQL Editor > New Query)
-- Safe to run once. Uses IF NOT EXISTS so it won't break if partially applied.
-- ============================================================

-- 1) From / To location of material movement
alter table gate_passes add column if not exists from_location text;
alter table gate_passes add column if not exists to_location text;

-- 2) Returnable gate pass support
--    "type" column already exists (previously 'inward'/'outward').
--    Going forward the app only writes 'returnable' / 'non_returnable' into it.
alter table gate_passes add column if not exists expiry_date timestamptz;       -- set by approver, only for returnable passes
alter table gate_passes add column if not exists exited_at timestamptz;         -- when security lets material exit the gate
alter table gate_passes add column if not exists returned_at timestamptz;       -- when returnable material comes back
alter table gate_passes add column if not exists overdue_notified boolean default false; -- reminder email dedup flag
alter table gate_passes add column if not exists exit_verified_by uuid references profiles(id);
alter table gate_passes add column if not exists return_verified_by uuid references profiles(id);
alter table gate_passes add column if not exists gate_reject_reason text;       -- if security denies exit/return

-- 3) Edited-after-approval tracking (for activity log readability — optional)
alter table gate_passes add column if not exists last_edited_at timestamptz;
alter table gate_passes add column if not exists last_edited_by uuid references profiles(id);

-- 4) Materials JSONB already exists. New shape per item (no DB change needed,
--    it's just JSON): { material_id, name, quantity, unit, value, date_issued }

-- 5) Helpful index for the security portal's "search by pass number" lookup
create index if not exists idx_gate_passes_pass_number on gate_passes (pass_number);

-- 6) Helpful index for the overdue-reminder cron job
create index if not exists idx_gate_passes_overdue_check
    on gate_passes (type, status, expiry_date)
    where type = 'returnable';
