#!/bin/bash

# Простой скрипт - весь проект в txt файл (кроме node_modules)

OUTPUT_FILE="all_project.txt"

echo "Собираю весь проект в $OUTPUT_FILE..."

# Очистить файл
> "$OUTPUT_FILE"

echo "=== СТРУКТУРА ПРОЕКТА ===" >> "$OUTPUT_FILE"
tree -I 'node_modules|dist|.git' >> "$OUTPUT_FILE" 2>/dev/null || find . -type f ! -path "./node_modules/*" ! -path "./dist/*" ! -path "./.git/*" | head -200 >> "$OUTPUT_FILE"

echo "" >> "$OUTPUT_FILE"
echo "=== СОДЕРЖИМОЕ ВСЕХ ФАЙЛОВ ===" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Найти и вывести все файлы (кроме node_modules)
find . -type f \
  ! -path "./node_modules/*" \
  ! -path "./dist/*" \
  ! -path "./.git/*" \
  ! -name "*.log" \
  ! -name "*.lock" \
  ! -name "$OUTPUT_FILE" \
  | while read file; do
    echo "────────── $file ──────────" >> "$OUTPUT_FILE"
    cat "$file" >> "$OUTPUT_FILE" 2>/dev/null || echo "[Не удалось прочитать файл]" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
done

echo "Готово! Размер: $(du -h $OUTPUT_FILE | cut -f1)"