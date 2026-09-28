ALTER TABLE users
  ADD COLUMN IF NOT EXISTS max_first_name varchar(120),
  ADD COLUMN IF NOT EXISTS max_last_name varchar(120),
  ADD COLUMN IF NOT EXISTS max_username varchar(120);
