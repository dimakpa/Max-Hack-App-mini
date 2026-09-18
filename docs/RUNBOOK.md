# Local runbook

## Чистый запуск

1. Установить Docker Desktop с Compose v2 и Node.js 22, если нужны локальные тесты вне контейнеров.
2. В корне проекта выполнить `docker compose up --build`.
3. Дождаться `healthy` у `db`, `backend`, `bot`, `frontend`: `docker compose ps`.
4. Проверить `http://localhost:3001/ready`, `http://localhost:3002/health` и открыть `http://localhost:8080`.
5. В интерфейсе выбрать тестовую роль. Compose уже явно задаёт `DEMO_AUTH=true` для локального demo.

Backend при старте применяет неприменённые SQL-миграции и идемпотентный seed. Основной запуск не загружает модель и не требует MAX.

## Локальное окружение

`.env.example` содержит только структуру. Создайте untracked `.env` вручную и задайте нужные значения. Настоящий токен нельзя добавлять в `.env.example`, код, Dockerfile, логи или документацию. Приложение получает токен только из `MAX_BOT_TOKEN`.

Проверка production-поведения без demo-обхода:

```bash
DEMO_AUTH=false docker compose up --build
```

Без валидного `window.WebApp.initData` защищённые API в таком режиме вернут `401`.

## Опциональный Ollama

1. Запустить совместимый runtime отдельно от Compose.
2. Самостоятельно подготовить модель. `docker compose up` ничего не скачивает.
3. Задать `AI_PROVIDER=ollama`, `OLLAMA_URL` и `OLLAMA_MODEL` в локальном окружении.
4. Пересоздать backend: `docker compose up --build -d backend`.
5. При таймауте, ошибке JSON или недоступности runtime backend прозрачно использует детерминированный mock и просит проверить поля.

Кандидаты `Qwen3 4B/8B` не считаются подтверждёнными для Mac 24 ГБ без отдельного измерения по `AI_BENCHMARK.md`.

## Тесты

```bash
npm install
npm run build
npm test
DATABASE_URL=postgres://techzakaz:techzakaz_local@localhost:5434/techzakaz DEMO_AUTH=true npm run test:integration
npx playwright install chromium
npm run test:e2e
npm audit
```

Playwright сохраняет responsive-скриншоты в `qa/screenshots/`. Каталог не входит в runtime image.

## Остановка и очистка

Остановить созданные контейнеры и сеть, сохранив БД:

```bash
docker compose down
```

Удалить только контейнеры проекта и его именованный volume:

```bash
docker compose down --volumes
```

Команда не должна применяться к другим Compose-проектам или внешней PostgreSQL.

## Будущий публичный MAX staging

Проверено по официальной документации MAX 18 сентября 2026 года:

- mini app привязывается к чат-боту и требует публичный `https://` URL;
- frontend получает строку из `window.WebApp.initData`, а backend валидирует её HMAC; `initDataUnsafe` не является доказательством личности;
- для production используется webhook по HTTPS с сертификатом доверенного центра;
- Bot API использует `https://platform-api2.max.ru`, токен передаётся заголовком `Authorization`;
- подписка webhook создаётся через `POST /subscriptions`; для приветствия нужен тип события `bot_started`.

Шаги:

1. Развернуть frontend, backend и bot за доверенным TLS ingress.
2. Задать `DEMO_AUTH=false`, точные `FRONTEND_ORIGIN`, `PUBLIC_APP_URL`, `PUBLIC_API_URL`.
3. Поместить `MAX_BOT_TOKEN` в secret store, не в image или manifest.
4. Указать HTTPS URL mini app в настройках бота на платформе MAX для партнёров.
5. Зарегистрировать HTTPS webhook методом `POST /subscriptions` с нужными `update_types`.
6. Проверить подпись, истечение `auth_date`, роли и deep link в web и mobile MAX.

Официальные источники: [подключение mini app](https://dev.max.ru/docs/webapps/introduction), [валидация](https://dev.max.ru/docs/webapps/validation), [MAX Bridge](https://dev.max.ru/docs/webapps/bridge), [подготовка бота](https://dev.max.ru/docs/chatbots/bots-coding/prepare), [POST /messages](https://dev.max.ru/docs-api/methods/POST/messages).

