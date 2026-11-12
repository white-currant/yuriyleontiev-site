#!/bin/sh
# Выкладка серверов сайта на Cloudflare Workers: ./deploy.sh rating | games
# Ключ Cloudflare — ~/.config/cloudflare/token (только Workers и D1), в журнал не печатается.
set -e
[ -n "$1" ] || { echo "Какой сервер: ./deploy.sh rating | games"; exit 1; }
cd "$(dirname "$0")/$1"
export CLOUDFLARE_API_TOKEN="$(cat ~/.config/cloudflare/token)"
export CLOUDFLARE_ACCOUNT_ID=8e68213523e27ead1ff3bd103c00cfbb
export WRANGLER_SEND_METRICS=false
npx -y wrangler@4.161.0 d1 execute "$(sed -n 's/^database_name = "\(.*\)"/\1/p' wrangler.toml)" --remote --file schema.sql -y >/dev/null
npx -y wrangler@4.161.0 deploy
