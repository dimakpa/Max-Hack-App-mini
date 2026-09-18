CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL UNIQUE,
  description varchar(500) NOT NULL,
  region varchar(120) NOT NULL,
  rating numeric(2,1) NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_count integer NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  demo_alias varchar(80) UNIQUE,
  max_user_id bigint UNIQUE,
  display_name varchar(120) NOT NULL,
  role varchar(20) NOT NULL CHECK (role IN ('CUSTOMER', 'DISPATCHER', 'ADMIN')),
  supplier_id uuid REFERENCES suppliers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'DISPATCHER' AND supplier_id IS NOT NULL) OR role <> 'DISPATCHER')
);

CREATE TABLE IF NOT EXISTS equipment (
  id uuid PRIMARY KEY,
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  category varchar(40) NOT NULL CHECK (category IN ('MOBILE_CRANE', 'TRACTOR', 'DUMP_TRUCK', 'BACKHOE_LOADER')),
  title varchar(120) NOT NULL,
  description varchar(500) NOT NULL,
  region varchar(120) NOT NULL,
  price_per_shift integer NOT NULL CHECK (price_per_shift > 0),
  response_minutes integer NOT NULL CHECK (response_minutes > 0),
  is_available boolean NOT NULL DEFAULT true,
  image_path varchar(255) NOT NULL,
  specifications jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_availability (
  id uuid PRIMARY KEY,
  equipment_id uuid NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  available_from timestamptz NOT NULL,
  available_to timestamptz NOT NULL,
  is_available boolean NOT NULL DEFAULT true,
  CHECK (available_to > available_from)
);
CREATE INDEX IF NOT EXISTS equipment_availability_lookup_idx
  ON equipment_availability(equipment_id, available_from, available_to);

CREATE TABLE IF NOT EXISTS request_drafts (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES users(id),
  source_text varchar(2000),
  category varchar(40) CHECK (category IN ('MOBILE_CRANE', 'TRACTOR', 'DUMP_TRUCK', 'BACKHOE_LOADER')),
  scheduled_at timestamptz,
  duration_hours integer CHECK (duration_hours BETWEEN 1 AND 168),
  locality varchar(120),
  work_description varchar(1000),
  constraints_text varchar(500),
  parser_provider varchar(30) NOT NULL DEFAULT 'manual',
  status varchar(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'READY', 'ORDERED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY,
  public_number varchar(20) NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES users(id),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  equipment_id uuid NOT NULL REFERENCES equipment(id),
  draft_id uuid NOT NULL REFERENCES request_drafts(id),
  client_request_id uuid NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('NEW', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED', 'CANCELLED')),
  category varchar(40) NOT NULL,
  scheduled_at timestamptz NOT NULL,
  duration_hours integer NOT NULL,
  locality varchar(120) NOT NULL,
  work_description varchar(1000) NOT NULL,
  constraints_text varchar(500),
  price_per_shift integer NOT NULL,
  decline_reason varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(customer_id, client_request_id)
);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_supplier_idx ON orders(supplier_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_events (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id),
  from_status varchar(20),
  to_status varchar(20) NOT NULL,
  note varchar(500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
  customer_id uuid NOT NULL REFERENCES users(id),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text varchar(500) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS callback_requests (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
  customer_id uuid NOT NULL REFERENCES users(id),
  status varchar(20) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'ACKNOWLEDGED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_applications (
  id uuid PRIMARY KEY,
  applicant_user_id uuid NOT NULL REFERENCES users(id),
  company_name varchar(120) NOT NULL,
  region varchar(120) NOT NULL,
  contact varchar(160) NOT NULL,
  categories jsonb NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'APPROVED', 'REJECTED')),
  rejection_reason varchar(500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY,
  recipient_user_id uuid NOT NULL REFERENCES users(id),
  type varchar(50) NOT NULL,
  order_id uuid REFERENCES orders(id),
  text varchar(1000) NOT NULL,
  deep_link_payload varchar(128),
  status varchar(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'DELIVERED_DRY_RUN', 'DELIVERED_MAX', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0,
  last_error varchar(500),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_outbox_idx ON notifications(status, created_at);

CREATE TABLE IF NOT EXISTS schema_migrations (
  name varchar(255) PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

