#!/bin/sh
# =====================================================================
# luci-app-sssplit — quick install for OpenWrt (tested on 24.10)
#
# Usage (on the router, as root):
#   wget -qO- "https://raw.githubusercontent.com/jeysson89/luci-app-sssplit/main/install.sh" | sh -s -- jeysson89
#   or:  sh install.sh <github-user>
#
# What it does:
#   1. opkg install ipt2socks + https-dns-proxy (DoH is REQUIRED:
#      the app manages and displays it),
#      + shadowsocksr fallback for the classic ssr engine
#   2. downloads the latest luci-app-sssplit ipk from GitHub releases
#   3. installs the app, enables the init script
#   4. downloads sslocal (shadowsocks-rust, RAM) for the AEAD engine
#
# Flags:  --no-rust   skip sslocal download (classical ssr engine only)
# =====================================================================
set -u

GH_USER="${1:-jeysson89}"
case "$GH_USER" in ""|_*|-*|\$*) echo "usage: sh install.sh <github-user>"; exit 1 ;; esac
PKG="luci-app-sssplit"
REPO="$GH_USER/luci-app-sssplit"
BASE="https://github.com/$REPO/releases/latest/download"
IPK="luci-app-sssplit_all.ipk"
TMP="/tmp/$IPK"

NO_RUST=0
for a in "${2:-}" "${3:-}"; do
	case "$a" in
		--no-rust) NO_RUST=1 ;;
	esac
done

[ "$(id -un 2>/dev/null)" = "root" ] || { echo "ERR: run as root (ssh root@<router>)"; exit 1; }
command -v opkg >/dev/null 2>&1 || { echo "ERR: opkg not found (OpenWrt required)"; exit 1; }

say() { echo "==> $1"; }

say "opkg update"
opkg update >/dev/null 2>&1

say "installing dependencies (all have a bundled copy in our releases)"
# helper: try opkg feed first, fall back to the ipk asset shipped in our
# releases (ipt2socks & shadowsocksr are NOT in the stock OpenWrt feeds)
dep() {
	p="$1" a="$2"
	opkg install "$p" >/dev/null 2>&1 || {
		[ -n "$a" ] || return 1
		wget -q -T 65 -O /tmp/dep.ipk "$BASE/$a" || return 1
		opkg install /tmp/dep.ipk >/dev/null 2>&1 || return 1
	}
	opkg list-installed 2>/dev/null | grep -q "^$p "
}
dep ipt2socks ipt2socks-1.1.4-r3_mipsel_24kc.ipk || { echo "ERR: ipt2socks (required)"; exit 1; }
# DoH is mandatory for this app: ctl configures/restarts https-dns-proxy and
# the Status tab reports it; fail the whole install when it is missing
dep https-dns-proxy https-dns-proxy_2026.05.06-r1_mipsel_24kc.ipk || { echo "ERR: https-dns-proxy (required)"; exit 1; }
dep luci-app-https-dns-proxy luci-app-https-dns-proxy_2026.05.06-r1_all.ipk || true
# ssr engine bits (optional fallback engine; rust/sslocal is the main one)
dep shadowsocksr-libev-ssr-redir shadowsocksr-libev-ssr-redir_2.5.10-r1_mipsel_24kc.ipk || \
	echo "WARN: ssr engine unavailable (use the rust engine for AEAD)"
dep shadowsocksr-libev-ssr-server shadowsocksr-libev-ssr-server_2.5.10-r1_mipsel_24kc.ipk || true

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
