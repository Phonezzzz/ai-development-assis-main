```bash
#!/bin/bash

# --- НАСТРОЙКИ ---
PROJECT_ROOT="."
OUTPUT_FILE="project_summary.txt"
EXCLUDED_DIRS=("./.venv" "./venv" "./node_modules" "./.git" "./__pycache__")
INCLUDED_EXTENSIONS=(".py" ".js" ".html" ".css" ".json" ".md" ".sh" ".toml")
# --- КОНЕЦ НАСТРОЕК ---

> "$OUTPUT_FILE"

echo "### СТРУКТУРА ПРОЕКТА ###" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

exclude_params=()
for dir in "${EXCLUDED_DIRS[@]}"; do
    exclude_params+=(-path "$dir" -o)
done
[[ ${#exclude_params[@]} -gt 0 ]] && unset 'exclude_params[${#exclude_params[@]}-1]'

find "$PROJECT_ROOT" -type d \( "${exclude_params[@]}" \) -prune -o -print | sed -e 's;[^/]*/;|____;g;s;____|; |;g' >> "$OUTPUT_FILE"

echo "" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "### СОДЕРЖИМОЕ ФАЙЛОВ ###" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

include_params=()
for ext in "${INCLUDED_EXTENSIONS[@]}"; do
    include_params+=(-name "*$ext" -o)
done
[[ ${#include_params[@]} -gt 0 ]] && unset 'include_params[${#include_params[@]}-1]'

find "$PROJECT_ROOT" -type f \( "${exclude_params[@]}" \) -prune -o -type f \( "${include_params[@]}" \) -print0 | while IFS= read -r -d $'\0' file; do
    echo "================================================================================" >> "$OUTPUT_FILE"
    echo "// ФАЙЛ: ${file}" >> "$OUTPUT_FILE"
    echo "================================================================================" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    cat "${file}" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
done

echo "Готово! Проект сохранен в: $OUTPUT_FILE"
```
