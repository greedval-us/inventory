import { execFileSync } from 'node:child_process';

// Use the repository's ignore rules, independently of a contributor's global Git settings.
const paths = execFileSync('git', ['ls-files', '--cached', '--ignored', '--exclude-per-directory=.gitignore', '-z'], {
  encoding: 'utf8',
}).split('\0').filter(Boolean);

if (paths.length) {
  console.error('В индексе Git обнаружены файлы, исключённые правилами репозитория.');
  for (const path of paths) console.error(JSON.stringify(path));
  process.exitCode = 1;
} else {
  console.log('Состав файлов в индексе Git прошёл проверку.');
}
