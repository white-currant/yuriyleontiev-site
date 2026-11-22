# Пилот выдачи портфолио для агентов

Worker подключается через маршрут `https://yuriyleontiev.music/`. Для обычного запроса он передаёт ответ GitHub Pages. Для подтверждённого `ChatGPT-User` или `PerplexityBot` он отдаёт HTML из `commission/index.html`, убирает CSS и указывает главную как canonical. Тело Commission копируется целиком. Публичная `/commission/` обслуживается GitHub Pages. При правке Commission пересобери Worker, чтобы обновить его копию.

Проверка сопоставляет User-Agent и `CF-Connecting-IP` с отдельным списком каждого поставщика. Списки обновляются при первом подходящем запросе в экземпляре Worker и затем раз в час, если поступают такие запросы. Пока список недоступен или невалиден, посетитель получает обычный сайт. Оба ответа на главной возвращаются с `no-store` для браузера и CDN. Worker не сохраняет HTML в Cache API.

## Тариф и источники

Достаточно Cloudflare Free для DNS и Workers Free для маршрута. Бесплатный лимит Workers составляет 100 000 запросов в сутки на аккаунт и 10 мс CPU на вызов. Все запросы к маршруту расходуют лимит. Для проверки агентов используются опубликованные IP-диапазоны, поэтому лицензия Bot Management и Markdown for Agents не нужны. [Лимиты Cloudflare Workers](https://developers.cloudflare.com/workers/platform/limits/)

- [OpenAI Crawlers](https://developers.openai.com/api/docs/bots) и [список ChatGPT-User](https://openai.com/chatgpt-user.json). OpenAI использует ChatGPT-User для обращений по запросу человека. Робот ChatGPT Search, OAI-SearchBot, получает обычный сайт.
- [Perplexity Crawlers](https://docs.perplexity.ai/docs/resources/perplexity-crawlers) и [список PerplexityBot](https://www.perplexity.ai/perplexitybot.json).
- [Как Cloudflare передаёт IP посетителя](https://developers.cloudflare.com/fundamentals/reference/http-headers/).

## Проверка до подключения

Из корня репозитория запусти:

```sh
node --test workers/portfolio-agent/pilot.test.mjs
npx wrangler@4.166.0 deploy --dry-run --config workers/portfolio-agent/wrangler.toml
```

## Подключение после согласования diff

1. Сохрани полный экспорт DNS из текущего DNS-провайдера. В Cloudflare добавь `yuriyleontiev.music` как зону Free, сверь все записи, включая iCloud Mail (MX, SPF, DKIM и DMARC, если настроен) и `www`. Оставь веб-записи в режиме DNS only на время переноса NS. Замени NS у регистратора на назначенные Cloudflare. Дождись статуса Active и проверь сайт и почту. [Настройка зоны Cloudflare](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)
2. Убедись, что GitHub Pages отдал действительный сертификат для `yuriyleontiev.music`. В Cloudflare выбери **SSL/TLS → Overview → Full (strict)** и включи **Proxied** для веб-записей корневого домена, сохраняя их назначения на GitHub Pages. Сверь сайт и `www` до добавления Worker. Для проверки IP оставь **Pseudo IPv4** в режиме, который не перезаписывает `CF-Connecting-IP`, и сохрани заголовки IP посетителя. [Режим Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/) · [HTTP-заголовки Cloudflare](https://developers.cloudflare.com/fundamentals/reference/http-headers/)
3. Опубликуй согласованные изменения сайта через обычный процесс GitHub Pages и проверь прямое открытие `/commission/`. Убедись, что для главной нет правила, принудительно кэширующего HTML. Если такое правило есть, исключи корневой путь из него или добавь для него **Cache eligibility → Bypass cache**.
4. Из корня репозитория выполни `npx wrangler@4.166.0 deploy --config workers/portfolio-agent/wrangler.toml`. Затем открой **Workers & Pages → yuriy-portfolio-agent → Settings → Domains & Routes → Add → Route**. Выбери зону `yuriyleontiev.music`, введи точный шаблон `https://yuriyleontiev.music/` и выбери **Fail open** в настройках маршрута. Сохрани маршрут. Точный шаблон охватывает только HTTPS-главную без строки запроса. [Настройка маршрута](https://developers.cloudflare.com/workers/configuration/routing/routes/) · [Fail open и дневной лимит](https://developers.cloudflare.com/workers/platform/limits/#daily-requests)
5. С обычного IP сравни ответы браузера и запросов ниже. На главной оба запроса должны получить портфолио с `Cache-Control: private, no-store`, а прямой путь Commission должен открыть страницу на GitHub Pages. На запросе от реального адреса из официального списка облегченную версию можно подтвердить по `X-Portfolio-Variant: commission`. При отсутствии таких запросов проверь, не блокируют ли выбранных агентов правила AI Crawl Control или Bot Fight Mode. [Рекомендации Perplexity для Cloudflare WAF](https://docs.perplexity.ai/docs/resources/perplexity-crawlers#cloudflare-waf)

   ```sh
   curl -fsSI https://yuriyleontiev.music/
   curl -fsSI -A 'ChatGPT-User/1.0' https://yuriyleontiev.music/
   curl -fsSI https://yuriyleontiev.music/commission/
   ```

## Быстрый откат

В **Settings → Domains & Routes** у Worker удали только маршрут `https://yuriyleontiev.music/`. Следующий запрос на главную пойдёт к GitHub Pages через Cloudflare. Проверь главную и `/commission/`. Если на шаге 3 создавал отдельное правило Bypass cache только для пилота, его можно удалить после проверки. Откат маршрута не требует изменения NS, исходного кода или настроек GitHub Pages.
