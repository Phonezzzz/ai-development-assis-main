import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Папки которые пропускаем
const SKIP_DIRS = ['node_modules', 'dist', 'build', '.git'];

// Файлы которые обрабатываем
const FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

let changedFiles = 0;
let totalReplacements = 0;

function shouldSkipDir(dirPath) {
  return SKIP_DIRS.some(skip => dirPath.includes(skip));
}

function fixConsoleLogsInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let newContent = content;
  let fileReplacements = 0;

  // Паттерн: console.log('текст', переменная) или console.log('текст', { object })
  // Заменяем ПОСЛЕДНИЙ аргумент на JSON.stringify(...)
  const pattern = /console\.(log|warn|error|info|debug)\(([^)]+)\)/g;
  
  newContent = content.replace(pattern, (match, method, args) => {
    // Разбиваем аргументы
    const argParts = args.split(',').map(a => a.trim());
    
    // Если только 1 аргумент или уже есть JSON.stringify - не трогаем
    if (argParts.length <= 1 || match.includes('JSON.stringify')) {
      return match;
    }
    
    // Берём последний аргумент
    const lastArg = argParts[argParts.length - 1];
    
    // Проверяем что это не строка, не число, не boolean
    const isSimpleValue = /^['"`]|^\d+$|^true$|^false$|^null$|^undefined$/.test(lastArg);
    
    if (isSimpleValue) {
      return match;
    }
    
    // Заменяем последний аргумент на JSON.stringify
    const otherArgs = argParts.slice(0, -1).join(', ');
    const newMatch = `console.${method}(${otherArgs}, JSON.stringify(${lastArg}, null, 2))`;
    
    fileReplacements++;
    return newMatch;
  });

  if (newContent !== content) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    changedFiles++;
    totalReplacements += fileReplacements;
    console.log(`✅ ${filePath} - изменено ${fileReplacements} логов`);
  }
}

function walkDirectory(dir) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      if (!shouldSkipDir(filePath)) {
        walkDirectory(filePath);
      }
    } else if (FILE_EXTENSIONS.some(ext => filePath.endsWith(ext))) {
      fixConsoleLogsInFile(filePath);
    }
  });
}

// Запускаем из текущей директории
const startDir = process.argv[2] || './src';

console.log(`🚀 Начинаем обработку в: ${startDir}\n`);
walkDirectory(startDir);

console.log(`\n📊 Итого:`);
console.log(`   Файлов изменено: ${changedFiles}`);
console.log(`   Всего замен: ${totalReplacements}`);
