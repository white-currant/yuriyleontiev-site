#!/bin/sh
# Перед выкладкой games/index.html: новая версия, чтобы мини-приложение само перезагрузилось на свежую страницу.
cd "$(dirname "$0")" && V=$(date +%Y%m%d%H%M) && printf '%s\n' "$V" > version.txt && sed -i '' "s/var BUILD = \"[0-9]*\"/var BUILD = \"$V\"/" index.html && echo "версия $V"
