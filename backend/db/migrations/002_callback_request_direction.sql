ALTER TABLE callback_requests
  RENAME COLUMN customer_id TO requester_user_id;

ALTER TABLE callback_requests
  DROP CONSTRAINT callback_requests_order_id_key;

ALTER TABLE callback_requests
  ADD COLUMN requester_role varchar(20);

UPDATE callback_requests
SET requester_role = 'CUSTOMER'
WHERE requester_role IS NULL;

ALTER TABLE callback_requests
  ALTER COLUMN requester_role SET NOT NULL,
  ADD CONSTRAINT callback_requests_requester_role_check
    CHECK (requester_role IN ('CUSTOMER', 'DISPATCHER'));

CREATE UNIQUE INDEX callback_requests_order_role_idx
  ON callback_requests(order_id, requester_role);
