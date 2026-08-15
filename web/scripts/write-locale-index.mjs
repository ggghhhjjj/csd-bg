import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = `<!doctype html>
<html lang="bg">
  <head>
    <meta charset="utf-8" />
    <title>CSD Free Float</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script>
      (function () {
        var stored = localStorage.getItem('csd-locale');
        var locale = stored === 'en' || stored === 'bg' ? stored : 'bg';
        location.replace('./' + locale + '/');
      })();
    </script>
  </head>
  <body></body>
</html>
`;

writeFileSync(join(root, 'www', 'index.html'), html, 'utf8');
