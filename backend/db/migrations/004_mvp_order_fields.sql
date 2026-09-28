ALTER TABLE request_drafts
  ADD COLUMN IF NOT EXISTS site_address varchar(200),
  ADD COLUMN IF NOT EXISTS work_volume varchar(300);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS site_address varchar(200),
  ADD COLUMN IF NOT EXISTS work_volume varchar(300);
