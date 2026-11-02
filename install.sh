#!/bin/sh
# =====================================================================
# luci-app-sssplit — quick install for OpenWrt (tested on 24.10)
#
# Usage (on the router, as root):
#   wget -qO- "https://raw.githubusercontent.com/jeysson89/luci-app-sssplit/main/install.sh" | sh -s -- jeysson89
#   or:  sh install.sh <github-user>
#
# What it does:
#   1. opkg install ipt2socks (+ https-dns-proxy for the DoH tab,
#      + shadowsocksr fallback for the classic ssr engine)
#   2. downloads the latest luci-app-sssplit ipk from GitHub releases
#   3. installs the app, enables the init script
#   4. downloads sslocal (shadowsocks-rust, RAM) for the AEAD engine
#
# Flags:  --no-doh    skip https-dns-proxy
#         --no-rust   skip sslocal download (classical ssr engine only)
# =====================================================================
set -u

GH_USER="${1:-jeysson89}"
case "$GH_USER" in ""|_*|-*|\$*) echo "usage: sh install.sh <github-user>"; exit 1 ;; esac
PKG="luci-app-sssplit"
REPO="$GH_USER/luci-app-sssplit"
BASE="https://github.com/$REPO/releases/latest/download"
IPK="luci-app-sssplit_all.ipk"
TMP="/tmp/$IPK"

NO_DOH=0; NO_RUST=0
for a in "${2:-}" "${3:-}"; do
	case "$a" in
		--no-doh) NO_DOH=1 ;;
		--no-rust) NO_RUST=1 ;;
	esac
done

[ "$(id -un 2>/dev/null)" = "root" ] || { echo "ERR: run as root (ssh root@<router>)"; exit 1; }
command -v opkg >/dev/null 2>&1 || { echo "ERR: opkg not found (OpenWrt required)"; exit 1; }

say() { echo "==> $1"; }

say "opkg update"
opkg update >/dev/null 2>&1

say "installing dependencies"
opkg install ipt2socks                    >/dev/null 2>&1 || opkg install ipt2socks || { echo "ERR: ipt2socks"; exit 1; }
if [ "$NO_DOH" = "0" ]; then
	opkg install https-dns-proxy >/dev/null 2>&1 || { echo "WARN: https-dns-proxy not installed (DoH tab stays informational)"; }
fi
# ssr engine fallback (AEAD engines need sslocal/rust instead)
opkg install shadowsocksr-libev-ssr-redir >/dev/null 2>&1 \
	|| opkg install shadowsocksr-libev    >/dev/null 2>&1 \
	|| echo "WARN: shadowsocksr not found (fine — use the rust/engine for AEAD)"

say "downloading $REPO release ipk"
dl_ok=0
for TF in 65 65; do
	wget -q -T "$TF" -O "$TMP" "$BASE/$IPK" 2>/dev/null && [ -s "$TMP" ] && { dl_ok=1; break; }
	uclient-fetch -q -T "$TF" -O "$TMP" "$BASE/$IPK" 2>/dev/null && [ -s "$TMP" ] && { dl_ok=1; break; }
done
[ "$dl_ok" = "1" ] || { echo "ERR: download failed — check $BASE"; exit 1; }

say "installing $PKG"
opkg install "$TMP" 2>&1 || opkg install --force-reinstall "$TMP" || { echo "ERR: install failed"; exit 1; }
rm -f "$TMP"

say "sslocal (shadowsocks-rust, kept in RAM; ~3.9 MB)"
if [ "$NO_RUST" = "0" ] && [ -x /usr/bin/sssplit-ctl ]; then
	/usr/bin/sssplit-ctl install-rust || echo "WARN: sslocal download failed (will retry on first apply)"
fi

say "done"
echo "Open LuCI:  http://<router>/cgi-bin/luci/admin/services/sssplit/status"
echo "1) Servers -> add ss:// or manual, flag the pool you want (auto pick uses flagged ones)"
echo "2) Settings -> routing mode / background check interval (60 s default when auto)"
echo "3) Status -> enable and watch"
