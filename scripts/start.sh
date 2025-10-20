#!/bin/bash

# AI Development Assistant - Стартовый скрипт

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Запуск AI Development Assistant...${NC}"

# Проверяем наличие .env файлов
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ Файл .env не найден!${NC}"
    echo -e "${YELLOW}Создай его из .env.example:${NC}"
    echo -e "${GREEN}cp .env.example .env${NC}"
    exit 1
fi

if [ ! -f "server/.env" ]; then
    echo -e "${RED}❌ Файл server/.env не найден!${NC}"
    echo -e "${YELLOW}Создай его из server/.env.example:${NC}"
    echo -e "${GREEN}cp server/.env.example server/.env${NC}"
    exit 1
fi

# Проверяем зависимости
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Установка зависимостей фронтенда...${NC}"
    npm install
fi

if [ ! -d "server/node_modules" ]; then
    echo -e "${YELLOW}📦 Установка зависимостей бэкенда...${NC}"
    cd server && npm install && cd ..
fi

# Создаем папки для хранения данных и логов
mkdir -p storage/.workspace
mkdir -p logs

# Запускаем Qdrant
echo -e "${YELLOW}🔄 Запуск Qdrant...${NC}"
if ! docker-compose ps qdrant | grep -q "Up"; then
    docker-compose up -d qdrant
    echo -e "${GREEN}✅ Qdrant запущен${NC}"
else
    echo -e "${GREEN}✅ Qdrant уже работает${NC}"
fi

# Ждем запуска Qdrant
echo -e "${YELLOW}⏳ Ожидание запуска Qdrant...${NC}"
for i in {1..10}; do
    if curl -s http://localhost:6333/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Qdrant готов${NC}"
        break
    fi
    if [ $i -eq 10 ]; then
        echo -e "${RED}❌ Qdrant не запустился${NC}"
        exit 1
    fi
    sleep 1
done

# Проверяем свободные порты
if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${RED}❌ Порт 5173 занят!${NC}"
    echo -e "${YELLOW}Освободи порт или измени конфигурацию${NC}"
    exit 1
fi

if lsof -Pi :4000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${RED}❌ Порт 4000 занят!${NC}"
    echo -e "${YELLOW}Освободи порт или измени конфигурацию${NC}"
    exit 1
fi

# Запускаем бэкенд в фоне
echo -e "${YELLOW}🔧 Запуск бэкенда...${NC}"
touch logs/backend.log
cd server && npm run dev > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Сохраняем PID для остановки
echo $BACKEND_PID > .backend.pid

# Ждем запуска бэкенда
echo -e "${YELLOW}⏳ Ожидание запуска бэкенда...${NC}"
for i in {1..15}; do
    if curl -s http://localhost:4000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Бэкенд готов${NC}"
        break
    fi
    if [ $i -eq 15 ]; then
        echo -e "${RED}❌ Бэкенд не запустился${NC}"
        echo -e "${YELLOW}Проверь логи: tail -f logs/backend.log${NC}"
        kill $BACKEND_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

# Запускаем фронтенд
echo -e "${YELLOW}🎨 Запуск фронтенда...${NC}"
touch logs/frontend.log
npm run dev > logs/frontend.log 2>&1 &
FRONTEND_PID=$!

# Сохраняем PID для остановки
echo $FRONTEND_PID > .frontend.pid

# Ждем запуска фронтенда
echo -e "${YELLOW}⏳ Ожидание запуска фронтенда...${NC}"
for i in {1..10}; do
    if curl -s http://localhost:5173 > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Фронтенд готов${NC}"
        break
    fi
    if [ $i -eq 10 ]; then
        echo -e "${RED}❌ Фронтенд не запустился${NC}"
        echo -e "${YELLOW}Проверь логи: tail -f logs/frontend.log${NC}"
        kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

echo -e "${GREEN}🎉 Все сервисы запущены!${NC}"
echo ""
echo -e "${BLUE}📱 Доступные сервисы:${NC}"
echo -e "${GREEN}• Frontend: http://localhost:5173${NC}"
echo -e "${GREEN}• Backend:  http://localhost:4000/health${NC}"
echo -e "${GREEN}• Qdrant:   http://localhost:6333/health${NC}"
echo ""
echo -e "${BLUE}📋 Управление:${NC}"
echo -e "${YELLOW}• Остановить: make down${NC}"
echo -e "${YELLOW}• Статус:    make status${NC}"
echo -e "${YELLOW}• Логи:      make logs${NC}"
echo ""
echo -e "${BLUE}📝 Логи процессов:${NC}"
echo -e "${YELLOW}• Бэкенд:  tail -f logs/backend.log${NC}"
echo -e "${YELLOW}• Фронтенд: tail -f logs/frontend.log${NC}"
echo -e "${YELLOW}• Qdrant:   make qdrant-logs${NC}"

# Показываем логи в фоне
echo -e "${YELLOW}📊 Показываю статус сервисов...${NC}"
sleep 2
make status