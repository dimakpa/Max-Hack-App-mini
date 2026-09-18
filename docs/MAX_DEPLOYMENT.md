# MAX и staging

Актуальность официальной документации проверена 18 сентября 2026 года.

## Что проверено локально

- React mini app работает в обычном браузере с явными demo-ролями.
- Backend запрещает demo-заголовок, когда `DEMO_AUTH` выключен.
- Реализован серверный HMAC-SHA256 алгоритм MAX: уникальные параметры, обязательный `hash`, сортировка, ключ `HMAC-SHA256("WebAppData", BOT_TOKEN)`, сравнение без утечки времени и проверка `auth_date`.
- Frontend передаёт только строку `window.WebApp.initData`; `initDataUnsafe` не используется для авторизации.
- Bot adapter записывает уведомления в outbox и доставляет их в dry-run без токена.
- MAX-клиент использует текущий домен `platform-api2.max.ru`, `Authorization` header и `POST /messages` с link-кнопкой.

## Что не проверено локально

- Настоящий профиль организации/бота и реальные пользователи MAX.
- Регистрация webhook и доставка событий MAX.
- Отправка сообщений по реальному токену.
- Mini app внутри web, iOS и Android MAX.
- Публичный домен, доверенный TLS и сетевые allowlist/сертификаты окружения.

`http://localhost` не является проверкой интеграции внутри MAX.

## Staging checklist

1. Подготовить домен и TLS-сертификат доверенного центра.
2. Опубликовать неизменяемые версии образов `frontend`, `backend`, `bot`.
3. Подключить внешнюю PostgreSQL, применить миграции, ограничить сетевой доступ и включить backup.
4. Задать `DEMO_AUTH=false`.
5. Задать `PUBLIC_APP_URL=https://...`, `PUBLIC_API_URL=https://...`, точный `FRONTEND_ORIGIN=https://...`.
6. Передать `MAX_BOT_TOKEN` через secret store.
7. Привязать URL mini app к боту в MAX для партнёров.
8. Создать webhook через `POST /subscriptions` на публичный bot endpoint; включить `bot_started` и используемые update types.
9. Создать/связать пользователей по доверенному `max_user_id`, не по данным браузера.
10. Проверить запуск и deep links вида `order_<public-id>`/`review_<public-id>` без персональных данных.
11. Пройти основной и негативный QA в web и mobile MAX.
12. Проверить лимиты Bot API, retry, наблюдаемость outbox и redaction логов.

## Readiness к будущему Kubernetes

Манифесты в MVP не создаются. Для следующего этапа нужны registry и immutable tags, Deployments для трёх stateless сервисов, внешний PostgreSQL или StatefulSet с PVC и backup, Secrets, ConfigMaps, readiness/liveness probes, Ingress с TLS, NetworkPolicy, миграционный Job, resource requests/limits, логирование и алерты по `FAILED` outbox.

Источники: [mini app](https://dev.max.ru/docs/webapps/introduction), [HMAC validation](https://dev.max.ru/docs/webapps/validation), [Bridge](https://dev.max.ru/docs/webapps/bridge), [bot prepare/webhook](https://dev.max.ru/docs/chatbots/bots-coding/prepare), [Bot API](https://dev.max.ru/docs-api).

