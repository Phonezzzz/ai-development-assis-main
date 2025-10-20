# Remove Silent Catch.md

Название: Remove Silent Catch Workflow

Шаг 1 - ПОИСК:
Найди все try-catch без throw.
Покажи список с кодом.

Шаг 2 - АНАЛИЗ:
Для каждого catch:
1. Нужен ли вообще try-catch?
2. Вариант 1: Убрать try-catch
3. Вариант 2: Добавить throw
Покажи рекомендации.

Шаг 3 - ИСПРАВЛЕНИЕ:
Исправляй по одному.
После каждого:
- npm run build
- git diff
- Жди подтверждения