# ТехЗаказ

MVP для подбора спецтехники с экипажем в Чувашской Республике внутри MAX. Заказчик описывает работу текстом или заполняет форму, проверяет обязательные параметры, выбирает предложение и отправляет заявку. Диспетчер поставщика подтверждает её и ведёт статусы.

## Публичный доступ

- Mini App: https://max-ai.5.63.152.157.sslip.io/
- Вход в MAX: [@t52_hakaton_max_bot](https://web.max.ru/51922339).
- API: тот же origin, путь `/api`; проверочный маршрут: `/health`.

Токены, webhook-secret и другие секреты не публикуются: они передаются контейнерам через окружение. Финальный commit для проверки нужно зафиксировать перед подачей и вписать в первый слайд презентации.

## Основной сценарий

1. Заказчик открывает Mini App из бота MAX.
2. Описывает задачу или заполняет форму: категория, время, длительность, населённый пункт, адрес объекта, объём работ и ограничения; при необходимости добавляет геометку и до четырёх фото/PDF материалов по объекту.
3. Проверяет и при необходимости исправляет черновик.
4. Получает до пяти доступных вариантов в зоне пилота, сравнивает цену, время подачи, рейтинг, характеристики и объяснение подбора.
5. Отправляет заявку выбранному поставщику.
6. Диспетчер подтверждает, переводит заявку в работу и завершает её; заказчик видит историю и может оставить один отзыв.

## Что реализовано

- роли заказчика и диспетчера поставщика;
- каталог из 10 единиц техники в четырёх категориях: автокраны, тракторы, самосвалы, экскаваторы-погрузчики;
- создание, редактирование и удаление карточек своей техники диспетчером, включая загрузку JPG/PNG/WebP до 3 МБ;
- геометка объекта и материалы к заявке: до четырёх JPG/PNG/WebP до 3 МБ или PDF до 5 МБ;
- подбор с проверкой времени, региона и занятости;
- объяснимое ранжирование, идемпотентное создание заявки и серверная машина состояний;
- история статусов, запрос обратного звонка, уведомления и отзыв после завершения;
- проверка MAX WebAppData на сервере в production и демонстрационные роли только при `DEMO_AUTH=true`.

Каталог, рейтинги, отзывы и поставщики в MVP синтетические. Имена карточек не подтверждают существование или участие соответствующих организаций.

## Запуск

Нужны Docker и Docker Compose.

```bash
cp .env.example .env
docker compose up --build
```

После запуска:

- интерфейс: `http://localhost:8080`;
- API и health: `http://localhost:8080/api`, `http://localhost:8080/health`;
- PostgreSQL: `localhost:5434`.

Повторный запуск после изменения seed-данных: `docker compose down -v && docker compose up --build`.

## Окружение

`.env.example` содержит все имена переменных. Для локального прогона нужны `POSTGRES_*`, `DEMO_AUTH=true`, `FRONTEND_ORIGIN`, `PUBLIC_APP_URL` и `PUBLIC_API_URL`. Для production задайте непустые `MAX_BOT_TOKEN`, `MAX_WEBHOOK_SECRET`, `FRONTEND_ORIGIN`, `PUBLIC_APP_URL`, `PUBLIC_API_URL` и отключите `DEMO_AUTH`.

## Архитектура

`bot` (MAX вход и уведомления) → `frontend` (React Mini App) → `backend` (Express API, авторизация, подбор и статусы) → `db` (PostgreSQL). Контейнер frontend выступает reverse proxy для `/api`, `/health` и `/uploads`. Загрузки техники и материалы заявок хранятся в Docker volume `techzakaz_uploads`.

## API и проверка

- Спецификация: [openapi.yaml](openapi.yaml)
- Проверочный файл для API: [DATA-API.yaml](DATA-API.yaml)
- Синтетические тестовые данные: [testdata/api-fixtures.json](testdata/api-fixtures.json)
- Демонстрационный сценарий: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)
- QA: [docs/QA_CHECKLIST.md](docs/QA_CHECKLIST.md)
- Предсдачный чек-лист: [docs/SUBMISSION_CHECKLIST.md](docs/SUBMISSION_CHECKLIST.md)
- Инструкция для жюри: [docs/JURY_INSTRUCTIONS.md](docs/JURY_INSTRUCTIONS.md)
- Форма фиксации интервью: [docs/INTERVIEW_RESULTS.md](docs/INTERVIEW_RESULTS.md)

Для локального demo API добавляйте заголовок `x-demo-user`: `customer`, `dispatcher-a`, `dispatcher-b` или `dispatcher-c`. Паролей нет. В production этот заголовок не работает: требуется валидный `x-max-init-data` из MAX.

```bash
npm test
npm run build
npm run test:e2e
```

Подробнее о развёртывании и восстановлении: [docs/MAX_DEPLOYMENT.md](docs/MAX_DEPLOYMENT.md), [docs/RUNBOOK.md](docs/RUNBOOK.md). Известные ограничения описаны в [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md).
