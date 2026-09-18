INSERT INTO suppliers (id, name, description, region, rating, review_count) VALUES
  ('20000000-0000-4000-8000-000000000001', 'Поставщик А', 'Техника с экипажем для строительных и погрузочных работ.', 'Чувашская Республика', 4.9, 38),
  ('20000000-0000-4000-8000-000000000002', 'Поставщик Б', 'Выезд по Чебоксарам и ближайшим населённым пунктам.', 'Чувашская Республика', 4.7, 25),
  ('20000000-0000-4000-8000-000000000003', 'Поставщик В', 'Синтетический поставщик для демонстрации срочных заявок.', 'Чувашская Республика', 4.6, 19)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, rating = EXCLUDED.rating;

INSERT INTO users (id, demo_alias, display_name, role, supplier_id) VALUES
  ('30000000-0000-4000-8000-000000000001', 'customer', 'Анна, заказчик', 'CUSTOMER', NULL),
  ('30000000-0000-4000-8000-000000000101', 'dispatcher-a', 'Илья, Поставщик А', 'DISPATCHER', '20000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000102', 'dispatcher-b', 'Ольга, Поставщик Б', 'DISPATCHER', '20000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000103', 'dispatcher-c', 'Максим, Поставщик В', 'DISPATCHER', '20000000-0000-4000-8000-000000000003')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role, supplier_id = EXCLUDED.supplier_id;

INSERT INTO equipment (id, supplier_id, category, title, description, region, price_per_shift, response_minutes, is_available, image_path, specifications) VALUES
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'MOBILE_CRANE', 'Автокран 25 т', 'Вылет стрелы до 28 м, опытный экипаж.', 'Чувашская Республика', 42000, 45, true, '/assets/fleet.png', '{"capacity":"25 т","boom":"28 м"}'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'MOBILE_CRANE', 'Автокран 32 т', 'Для монтажа конструкций и разгрузки материалов.', 'Чувашская Республика', 49000, 70, true, '/assets/fleet.png', '{"capacity":"32 т","boom":"31 м"}'),
  ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'MOBILE_CRANE', 'Автокран компактный 16 т', 'Компактная база для тесных строительных площадок.', 'Чувашская Республика', 37000, 55, true, '/assets/fleet.png', '{"capacity":"16 т","boom":"21 м"}'),
  ('10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'TRACTOR', 'Трактор с фронтальным погрузчиком', 'Ковш и щётка, экипаж включён.', 'Чувашская Республика', 26000, 40, true, '/assets/fleet.png', '{"attachments":"ковш, щётка"}'),
  ('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', 'TRACTOR', 'Трактор с отвалом', 'Планировка территории и уборка площадки.', 'Чувашская Республика', 24000, 60, true, '/assets/fleet.png', '{"attachments":"отвал"}'),
  ('10000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001', 'DUMP_TRUCK', 'Самосвал 20 т', 'Перевозка грунта и сыпучих материалов.', 'Чувашская Республика', 30000, 35, true, '/assets/fleet.png', '{"capacity":"20 т","body":"16 м³"}'),
  ('10000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000003', 'DUMP_TRUCK', 'Самосвал 15 т', 'Манёвренный самосвал с экипажем.', 'Чувашская Республика', 27000, 50, true, '/assets/fleet.png', '{"capacity":"15 т","body":"12 м³"}'),
  ('10000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000002', 'BACKHOE_LOADER', 'Экскаватор-погрузчик', 'Ковш 1 м³ и обратная лопата.', 'Чувашская Республика', 32000, 45, true, '/assets/fleet.png', '{"bucket":"1 м³","depth":"5.5 м"}'),
  ('10000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000003', 'BACKHOE_LOADER', 'Экскаватор-погрузчик компактный', 'Подходит для дворов и ограниченного проезда.', 'Чувашская Республика', 29500, 65, false, '/assets/fleet.png', '{"bucket":"0.8 м³","depth":"4.8 м"}')
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, price_per_shift = EXCLUDED.price_per_shift, response_minutes = EXCLUDED.response_minutes, is_available = EXCLUDED.is_available;

INSERT INTO equipment_availability (id, equipment_id, available_from, available_to, is_available)
SELECT
  ('40000000-0000-4000-8000-' || lpad(row_number() OVER (ORDER BY id)::text, 12, '0'))::uuid,
  id,
  '2025-01-01T00:00:00Z'::timestamptz,
  '2031-01-01T00:00:00Z'::timestamptz,
  is_available
FROM equipment
ON CONFLICT (id) DO UPDATE SET is_available = EXCLUDED.is_available;

