#!/bin/bash

# AI Development Assistant - Скрипт остановки

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🛑 Остановка AI Development Assistant...${NC}"

# Останавливаем процессы по PID
if [ -f ".backend.pid" ]; then
    BACKEND_PID=$(cat .backend.pid)
    if ps -p $BACKEND_PID > /dev/null 2>&1; then
        echo -e "${YELLOW}🔧 Остановка бэкенда (PID: $BACKEND_PID)...${NC}"
        kill $BACKEND_PID
        sleep 2
        # Принудительно убиваем если не остановился
        if ps -p $BACKEND_PID > /dev/null 2>&1; then
            kill -9 $BACKEND_PID
        fi
        echo -e "${GREEN}✅ Бэкенд остановлен${NC}"
    else
        echo -e "${YELLOW}⚠️  Бэкенд уже не работает${NC}"
    fi
    rm -f .backend.pid
else
    echo -e "${YELLOW}⚠️  Файл .backend.pid не найден${NC}"
fi

if [ -f ".frontend.pid" ]; then
    FRONTEND_PID=$(cat .frontend.pid)
    if ps -p $FRONTEND_PID > /dev/null 2>&1; then
        echo -e "${YELLOW}🎨 Остановка фронтенда (PID: $FRONTEND_PID)...${NC}"
        kill $FRONTEND_PID
        sleep 2
        # Принудительно убиваем если не остановился
        if ps -p $FRONTEND_PID > /dev/null 2>&1; then
            kill -9 $FRONTEND_PID
        fi
        echo -e "${GREEN}✅ Фронтенд остановлен${NC}"
    else
        echo -e "${YELLOW}⚠️  Фронтенд уже не работает${NC}"
    fi
    rm -f .frontend.pid
else
    echo -e "${YELLOW}⚠️  Файл .frontend.pid не найден${NC}"
fi

# Останавливаем Qdrant
echo -e "${YELLOW}🔄 Остановка Qdrant...${NC}"
if docker-compose ps qdrant | grep -q "Up"; then
    docker-compose down qdrant
    echo -e "${GREEN}✅ Qdrant остановлен${NC}"
else
    echo -e "${YELLOW}⚠️  Qdrant уже не работает${NC}"
fi

# Дополнительная очистка - убиваем процессы на портах
echo -e "${YELLOW}🧹 Очистка портов...${NC}"

# Порт 4000 (бэкенд)
BACKEND_PORT_PID=$(lsof -ti:4000 2>/dev/null || true)
if [ ! -z "$BACKEND_PORT_PID" ]; then
    echo -e "${YELLOW}🔧 Убиваем процесс на порту 4000...${NC}"
    kill -9 $BACKEND_PORT_PID 2>/dev/null || true
fi

# Порт 5173 (фронтенд)
FRONTEND_PORT_PID=$(lsof -ti:5173 2>/dev/null || true)
if [ ! -z "$FRONTEND_PORT_PID" ]; then
    echo -e "${YELLOW}🎨 Убиваем процесс на порту 5173...${NC}"
    kill -9 $FRONTEND_PORT_PID 2>/dev/null || true
fi

# Убиваем все процессы node связанные с проектом
echo -e "${YELLOW}🧹 Очистка Node процессов...${NC}"
pkill -f "npm run dev" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "ts-node-dev" 2>/dev/null || true

echo -e "${GREEN}🎉 Все сервисы остановлены!${NC}"
echo ""
echo -e "${BLUE}📋 Управление:${NC}"
echo -e "${YELLOW}• Запустить: make up${NC}"
echo -e "${YELLOW}• Статус:    make status${NC}"
echo -e "${YELLOW}• Логи:      make logs${NC}"

# Показываем финальный статус
sleep 1
echo -e "${BLUE}📊 Текущий статус:${NC}"
make status