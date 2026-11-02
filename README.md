# luci-app-sssplit

LuCI-приложение для OpenWrt: **раздельная маршрутизация через Shadowsocks** с автовыбором сервера, списками itdog (podkop) и мониторингом.

Протестировано: Xiaomi Mi Router 4A Gigabit, OpenWrt 24.10 (mipsel_24kc).

## Возможности
- **Серверы**: импорт `ss://` (SIP002/AEAD), таблица с колонкой «Статус / пинг», кнопки «Вкл все / Выкл все / Проверить все (ping) / Автовыбор».
- **Автовыбор**: тестируются только отмеченные серверы (пул кандидатов), лучший по пингу запоминается отдельной меткой; фоновая автопроверка от 60 сек переключает на более быстрый сервер при просадке.
- **Списки**: ручные домены/IP (прокси и прямые) + каталог источников **itdoginfo/allow-domains** (31 источник: домены РФ, YouTube, Meta, Discord, TikTok, Google AI, категории, подсети v4 Meta/CF/Steam-сопутствующие и хостеров). Включение галочки — сразу догружает источник с репозитория.
- **Статус**: карточки состояния, какие службы запущены (sslocal/ssr-libev, ipt2socks, https-dns-proxy, монитор), график трафика в реальном времени (nft-счётчики).
- **DNS (DoH)**: монитор https-dns-proxy, детектор утечек, штатный фикс dnsmasq.
- **Клиенты**: правила по MAC/IP (весь трафик устройства в прокси / исключение).

## Установка (на роутере, требует интернет)
```sh
wget -qO- "https://raw.githubusercontent.com/jeysson89/luci-app-sssplit/main/install.sh" | sh -s -- jeysson89
```
Скрипт: ставит `ipt2socks` (+ `https-dns-proxy`), качает последний ipk из Releases, устанавливает приложение и скачивает `sslocal` (shadowsocks-rust, работает из RAM — flash трогает только конфиг).

Флаги: `--no-doh` — без DoH, `--no-rust` — без sslocal (движок ssr).

## Сборка ipk
```sh
sh build/build-ipk.sh            # → dist/luci-app-sssplit_1.0.0-1_all.ipk
```
CI: при пуше тега `v*` GitHub Actions собирает ipk и публикует релиз со стабильным файлом `luci-app-sssplit_all.ipk` (на него ссылается install.sh).

## Требования
- OpenWrt 24.10 + luci-base, ipt2socks (ставит install.sh).
- AEAD-шифры (chacha20-ietf-poly1305, aes-256-gcm, 2022-*) — движок `rust` (sslocal в RAM).
- Классические stream-шифры — движок `ssr` (ssr-redir из shadowsocksr-libev).
- Роутеры с <8 MB flash: sslocal хранится в /tmp и качается с release Openwrt-Passwall/passwall2 — после перезагрузки перезакачивается автоматически при первом «Применить».

## Отказ от ответственности
Проект для об`единения списков публичных прокси-источников. Автор не предоставляет серверы.
