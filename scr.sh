#!/bin/bash
echo "=== Проверка проекта ==="

npm run build || exit 1

ANY=$(grep -r ": any" src --include="*.ts" --include="*.tsx" | wc -l)
echo "Any types: $ANY (было: 35)"

CATCH=$(grep -rn "} catch" src --include="*.ts" --include="*.tsx" | wc -l)
echo "Try-catch: $CATCH (было: 236)"

echo "=== Done ==="
