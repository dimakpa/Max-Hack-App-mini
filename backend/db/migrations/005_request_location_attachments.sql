ALTER TABLE request_drafts
  ADD COLUMN IF NOT EXISTS site_latitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS site_longitude numeric(9,6);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS site_latitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS site_longitude numeric(9,6);

CREATE TABLE IF NOT EXISTS request_attachments (
  id uuid PRIMARY KEY,
  draft_id uuid NOT NULL REFERENCES request_drafts(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  kind varchar(10) NOT NULL CHECK (kind IN ('PHOTO', 'PDF')),
  file_path varchar(255) NOT NULL,
  file_name varchar(160) NOT NULL,
  content_type varchar(80) NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS request_attachments_draft_idx ON request_attachments(draft_id, created_at);
CREATE INDEX IF NOT EXISTS request_attachments_order_idx ON request_attachments(order_id, created_at);
