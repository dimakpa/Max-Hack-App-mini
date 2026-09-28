# Деплой из GitHub Actions

Каждый push в `main` запускает тесты, синхронизирует репозиторий с демо-VPS и пересобирает стек Docker Compose. Данные PostgreSQL, сертификаты Caddy и `/opt/techzakaz/.env` остаются только на VPS.

## Однократная настройка

1. На VPS создаётся пользователь `techzakaz-deploy`, а его публичный ключ добавляется в SSH. Этот ключ выделен для GitHub Actions и не является ключом разработчика для push в GitHub.
2. В репозитории GitHub откройте `Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`.
3. Создайте секрет `REG_RU_DEPLOY_KEY` и вставьте полный приватный ключ, включая строки `BEGIN` и `END`.
4. Закоммитьте и отправьте в `main` файлы `.github/workflows/deploy.yml`, `.github/known_hosts` и `.deployignore`.

Workflow не нуждается в GitHub Personal Access Token на сервере. Личный SSH-ключ или access token нужен только для отправки коммитов с локального компьютера в GitHub.

## Схема выкладки

```text
local git push -> GitHub Actions -> tests and build -> SSH + rsync -> REG.RU Docker Compose
```

Открывайте вкладку `Actions` в GitHub, чтобы посмотреть журнал выкладки или запустить её вручную через `Run workflow`.

## Работа с секретами

- Не коммитьте `.env`, `token_max.md`, приватные SSH-ключи и секрет GitHub Actions.
- Workflow исключает серверные секреты из rsync, поэтому выкладка не может перезаписать `/opt/techzakaz/.env`.
- Если deploy-ключ оказался раскрыт, удалите его публичную часть из `/home/techzakaz-deploy/.ssh/authorized_keys`, создайте новую пару и замените `REG_RU_DEPLOY_KEY`.
