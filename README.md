# ТехЗаказ MVP для MAX

ТехЗаказ — хакатонный B2B-сервис для заказа спецтехники с экипажем в Чебоксарах и Чувашской Республике. Заказчик описывает задачу или заполняет форму, проверяет параметры, сравнивает предложения и отправляет заявку. Диспетчер выбранного поставщика подтверждает её и ведёт до завершения, после чего заказчик оставляет один отзыв.

Все поставщики, техника, цены, рейтинги, отзывы и изображение в demo-режиме синтетические. Они не подтверждены MAX или внешним сервисом.

## Границы MVP

В MVP есть четыре категории: автокран, трактор с навесным оборудованием, самосвал КамАЗ и экскаватор-погрузчик. Техника предоставляется только с экипажем.

Нет оплаты, договоров, реальной верификации компаний, вакансий, поиска работников, GPS/карт, CRM, внешних каталогов, рекламы и тарифов. `ТехСмена` остаётся возможным развитием, но не реализована.

## Архитектура

```text
React mini app ──REST + MAX WebAppData──> Backend API ──SQL──> PostgreSQL
                                              │                  ▲
                                              └─notification outbox
                                                                 │
                                     Bot adapter ──poll/deliver───┘
                                          │
                                          └─dry-run или MAX Bot API
```

- `frontend`: React 19 + Vite + TypeScript, адаптивный интерфейс mini app.
- `backend`: Express 5 + TypeScript + Zod, авторизация, статусная машина, подбор и бизнес-правила.
- `bot`: отдельный outbox worker и webhook-адаптер. Без токена работает в dry-run.
- `db`: PostgreSQL 16, миграция и воспроизводимый seed.

Backend не доверяет роли, цене, поставщику или статусу из браузера. Demo-роль выбирается только из посеянных пользователей; в MAX-режиме backend проверяет HMAC `WebAppData` до доступа к данным.

## Быстрый запуск

Требуются Docker Desktop и Docker Compose v2.

```bash
docker compose up --build
```

Откройте `http://localhost:8080`. Compose явно включает локальный demo-режим; production-образ backend по умолчанию его не включает. Локальная LLM и токен MAX не нужны.

Порты:

| Сервис | URL |
|---|---|
| Frontend | `http://localhost:8080` |
| Backend API | `http://localhost:3001` |
| Bot health/webhook | `http://localhost:3002` |
| PostgreSQL | `localhost:5434` |

Остановка:

```bash
docker compose down
```

Удаление только созданного volume с тестовыми данными:

```bash
docker compose down --volumes
```

## Тестовые роли

Переключатель виден только в demo-сборке.

| Alias | Роль | Назначение |
|---|---|---|
| `customer` | Анна, заказчик | Создание заявки, звонок, отзыв |
| `dispatcher-a` | Илья, Поставщик А | Обработка заявок Поставщика А |
| `dispatcher-b` | Ольга, Поставщик Б | Проверка изоляции поставщиков |
| `dispatcher-c` | Максим, Поставщик В | Проверка изоляции поставщиков |

Seed создаёт `Поставщик А`, `Поставщик Б`, `Поставщик В`, 9 единиц техники и интервалы доступности. Недоступная единица оставлена для негативной проверки.

## Главный сценарий

1. Под ролью заказчика выберите `Описать задачу` или `Заполнить вручную`.
2. Проверьте обязательные поля, получите предложения и выберите технику Поставщика А.
3. Откройте `Мои заявки`: статус `Новая`.
4. Переключитесь на `dispatcher-a`: до подтверждения можно запросить связь с заказчиком.
5. Подтвердите заказ, начните работы и проверьте возврат на один статус назад с обязательной причиной.
6. Снова начните и завершите работы, вернитесь к `customer` и оставьте один отзыв.
7. В `Уведомлениях` видны события, которые bot adapter доставил как `dry-run`.

## Переменные окружения

Скопируйте структуру из `.env.example` в локальный `.env` и заполните вручную. Репозиторий и приложение не читают локальный файл с токеном. Реальный токен передаётся только как `MAX_BOT_TOKEN` через окружение или secret store.

| Переменная | Назначение | Значение по умолчанию |
|---|---|---|
| `DEMO_AUTH` | Разрешает только фиксированные demo-роли | `false` в приложении; `true` в локальном Compose |
| `MAX_BOT_TOKEN` | HMAC и отправка сообщений MAX | пусто, dry-run |
| `PUBLIC_APP_URL` | Публичный HTTPS URL mini app | локальный URL в Compose |
| `PUBLIC_API_URL` | Публичный HTTPS URL API/webhook | локальный URL в Compose |
| `FRONTEND_ORIGIN` | Явный CORS origin | `http://localhost:8080` |
| `TRUST_PROXY_HOPS` | Число доверенных reverse-proxy hop для IP/rate limit | `0`; в Compose `1` |
| `AI_PROVIDER` | `mock`, `ollama` или `openai_compatible` | `mock` |
| `AI_TIMEOUT_MS` | Таймаут локальной модели | `30000` |
| `OLLAMA_URL` | URL совместимого runtime | `http://host.docker.internal:11434` |
| `OLLAMA_MODEL` | Имя локальной модели | `qwen3:4b` |
| `OPENAI_COMPATIBLE_URL` | OpenAI-compatible API MLX/vLLM | `http://host.docker.internal:11435/v1` |
| `OPENAI_COMPATIBLE_MODEL` | Имя модели в runtime | `mlx-community/Qwen3-8B-4bit` |

## Локальный Qwen3-8B на Apple Silicon

Найденная модель имеет формат MLX 4-bit. Для локального Mac используйте установленный MLX Server; этот же backend-контракт совместим с vLLM через OpenAI API.

В первом терминале:

```bash
npm run ai:start
```

Во втором терминале пересоздайте backend с модельным провайдером:

```bash
AI_PROVIDER=openai_compatible docker compose up --build -d backend frontend bot
```

Проверить runtime и полный путь через backend:

```bash
npm run ai:smoke
```

Затем откройте `http://localhost:8080`, нажмите `Описать задачу` и подготовьте черновик. В ответе `POST /api/drafts/parse` поле `draft.parserProvider` должно иметь значение `openai_compatible`, а `fallback` — `false`. Если runtime недоступен, сервис безопасно использует детерминированный parser и показывает предупреждение.

## Команды разработки

```bash
npm install
npm run build
npm test
DATABASE_URL=postgres://techzakaz:techzakaz_local@localhost:5434/techzakaz DEMO_AUTH=true npm run test:integration
npm run test:e2e
npm run lint
npm run audit:prod
```

Миграции и seed отдельно:

```bash
DATABASE_URL=postgres://techzakaz:techzakaz_local@localhost:5434/techzakaz npm run db:migrate
DATABASE_URL=postgres://techzakaz:techzakaz_local@localhost:5434/techzakaz npm run db:seed
```

E2E очищает только изменяемые demo-таблицы в локальной тестовой БД. Не направляйте `E2E_DATABASE_URL` на staging или production.

## REST API

Все `/api/*` требуют `x-demo-user` при `DEMO_AUTH=true` или валидный `x-max-init-data` в MAX-режиме.

| Метод | Путь | Операция |
|---|---|---|
| `POST` | `/api/drafts/parse` | Черновик из русского текста |
| `POST`, `PUT` | `/api/drafts`, `/api/drafts/:id` | Ручной черновик и подтверждение полей |
| `GET` | `/api/drafts/:id/proposals` | Фильтрация и объяснимое ранжирование |
| `POST` | `/api/orders` | Идемпотентное создание заказа |
| `GET` | `/api/orders`, `/api/orders/:id` | Списки и детали по правам роли |
| `POST` | `/api/orders/:id/status` | Допустимый переход статуса |
| `POST` | `/api/orders/:id/status/rollback` | Аудируемый возврат поставщиком на один статус назад |
| `POST` | `/api/orders/:id/callback` | Запрос связи заказчиком или поставщиком |
| `POST` | `/api/orders/:id/callback/acknowledge` | Подтверждение состоявшейся связи |
| `POST` | `/api/orders/:id/review` | Единственный отзыв завершённого заказа |
| `POST` | `/api/supplier-applications` | Заявка со статусом `SUBMITTED` |
| `GET` | `/api/notifications` | Проверяемые уведомления/outbox |
| `GET` | `/health`, `/ready` | Liveness/readiness без секретов |

## Ограничения проверки

Локально проверяются браузерный demo-режим, PostgreSQL, API, миграции, seed и dry-run уведомлений. Реальная доставка MAX, webhook, запуск mini app внутри web/mobile MAX и доверенный публичный HTTPS не проверяются без токена, домена и настроек бота. Подробности: [RUNBOOK](docs/RUNBOOK.md), [MAX deployment](docs/MAX_DEPLOYMENT.md), [QA](docs/QA_CHECKLIST.md), [Security](docs/SECURITY_CHECKLIST.md), [AI benchmark](docs/AI_BENCHMARK.md), [Demo script](docs/DEMO_SCRIPT.md).
