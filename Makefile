# AI Development Assistant - Makefile

.PHONY: help up down install clean logs status reset

# Цвета для вывода
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[0;33m
BLUE := \033[0;34m
NC := \033[0m # No Color

help: ## Показать эту справку
	@echo "$(BLUE)AI Development Assistant - Команды:$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-15s$(NC) %s\n", $$1, $$2}'

install: ## Установить все зависимости
	@echo "$(YELLOW)Установка зависимостей...$(NC)"
	npm install
	cd server && npm install
	@echo "$(GREEN)✅ Все зависимости установлены$(NC)"

up: ## Запустить весь проект (frontend + backend + qdrant)
	@echo "$(YELLOW)Запуск AI Assistant...$(NC)"
	@chmod +x scripts/start.sh
	@./scripts/start.sh

down: ## Остановить весь проект
	@echo "$(YELLOW)Остановка проекта...$(NC)"
	@chmod +x scripts/stop.sh
	@./scripts/stop.sh

dev: ## Запустить в режиме разработки (2 терминала)
	@echo "$(YELLOW)Запуск в режиме разработки...$(NC)"
	@echo "$(BLUE)Открой 2 терминала и выполни:$(NC)"
	@echo "$(GREEN)Терминал 1: npm run dev$(NC)"
	@echo "$(GREEN)Терминал 2: cd server && npm run dev$(NC)"

logs: ## Показать логи
	@echo "$(BLUE)Frontend: http://localhost:5173$(NC)"
	@echo "$(BLUE)Backend: http://localhost:4000/health$(NC)"
	@echo "$(BLUE)Qdrant: http://localhost:6333/health$(NC)"

status: ## Проверить статус сервисов
	@echo "$(BLUE)Проверка статуса...$(NC)"
	@curl -s http://localhost:4000/health > /dev/null && echo "$(GREEN)✅ Backend работает$(NC)" || echo "$(RED)❌ Backend не работает$(NC)"
	@curl -s http://localhost:5173 > /dev/null && echo "$(GREEN)✅ Frontend работает$(NC)" || echo "$(RED)❌ Frontend не работает$(NC)"
	@curl -s http://localhost:6333/health > /dev/null && echo "$(GREEN)✅ Qdrant работает$(NC)" || echo "$(RED)❌ Qdrant не работает$(NC)"

clean: ## Очистить временные файлы
	@echo "$(YELLOW)Очистка...$(NC)"
	rm -rf node_modules/.cache
	rm -rf server/node_modules/.cache
	rm -rf dist
	rm -rf server/dist
	@echo "$(GREEN)✅ Очистка завершена$(NC)"

reset: ## Полный сброс (удалить node_modules и переустановить)
	@echo "$(YELLOW)Полный сброс проекта...$(NC)"
	rm -rf node_modules
	rm -rf server/node_modules
	@make install
	@echo "$(GREEN)✅ Проект сброшен и готов к работе$(NC)"

qdrant-up: ## Запустить только Qdrant
	@echo "$(YELLOW)Запуск Qdrant...$(NC)"
	docker-compose up -d qdrant
	@echo "$(GREEN)✅ Qdrant запущен$(NC)"

qdrant-down: ## Остановить только Qdrant
	@echo "$(YELLOW)Остановка Qdrant...$(NC)"
	docker-compose down qdrant
	@echo "$(GREEN)✅ Qdrant остановлен$(NC)"

qdrant-logs: ## Показать логи Qdrant
	docker-compose logs -f qdrant