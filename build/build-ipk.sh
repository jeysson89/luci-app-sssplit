#!/bin/sh
# Build luci-app-sssplit_<ver>_all.ipk  (run on Linux / GitHub Actions)
# usage: build-ipk.sh [version]   (default 1.0.0-1)
set -e

PKG=luci-app-sssplit
VER="${1:-1.0.0-1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT

# ---------------------------------------------------------------- data tree
DATA="$BUILD/data"
cp -a "$ROOT/src/." "$DATA/"
chmod 0755 "$DATA/usr/bin/sssplit-ctl" "$DATA/etc/init.d/sssplit" 2>/dev/null || true

# ---------------------------------------------------------------- control
CONTROL="$BUILD/control"
mkdir -p "$CONTROL" "$DATA/CONTROL"

cat > "$CONTROL/control" <<EOF
Package: $PKG
Version: $VER
Architecture: all
Depends: libc, luci-base, ipt2socks
Maintainer: sssplit
Section: luci
Source: https://github.com/jeysson89/$PKG
Description: SS Split - LuCI app for transparent Shadowsocks routing.
 Split routing by domain/IP lists (itdog/podkop sources), auto server
 pick (best latency, background check from 60 s), DoH/DNS monitor,
 per-server status and ping, traffic graph.
EOF

cat > "$CONTROL/postinst" <<'EOF'
#!/bin/sh
chmod 0755 /usr/bin/sssplit-ctl /etc/init.d/sssplit 2>/dev/null
[ -x /etc/init.d/sssplit ] && /etc/init.d/sssplit enable 2>/dev/null
[ -x /etc/init.d/rpcd ] && /etc/init.d/rpcd restart >/dev/null 2>&1
exit 0
EOF

cat > "$CONTROL/prerm" <<'EOF'
#!/bin/sh
[ -x /etc/init.d/sssplit ] && /etc/init.d/sssplit stop >/dev/null 2>&1
[ -x /usr/bin/sssplit-ctl ] && /usr/bin/sssplit-ctl stop >/dev/null 2>&1
exit 0
EOF

cat > "$CONTROL/conffiles" <<'EOF'
/etc/config/sssplit
/etc/sssplit/proxy_domains.txt
/etc/sssplit/direct_domains.txt
/etc/sssplit/proxy_ip.list
/etc/sssplit/direct_ip.list
/etc/sssplit/proxy_ip6.list
/etc/sssplit/direct_ip6.list
EOF

chmod 0755 "$CONTROL/postinst" "$CONTROL/prerm"

# ---------------------------------------------------------------- pack
( cd "$CONTROL" && tar --numeric-owner --owner=0 --group=0 -czf ../control.tar.gz ./ )
( cd "$DATA"    && tar --numeric-owner --owner=0 --group=0 -czf ../data.tar.gz ./ )
printf '2.0\n' > "$BUILD/debian-binary"

OUT="$ROOT/dist"
mkdir -p "$OUT"
rm -f "$OUT/${PKG}_${VER}_all.ipk" "$OUT/${PKG}_all.ipk"

# pack the ar container in (pure) python: GNU ar writes member names with a
# trailing '/' ("control.tar.gz/"), which opkg rejects as a malformed package
( cd "$BUILD" && python3 - "$OUT/${PKG}_${VER}_all.ipk" <<'PYEOF'
import sys, os
out, names = sys.argv[1], ['debian-binary', 'control.tar.gz', 'data.tar.gz']
with open(out, 'wb') as f:
    f.write(b'!<arch>\n')
    for n in names:
        d = open(n, 'rb').read()
        hdr  = n.encode().ljust(16)[:16]
        hdr += str(int(os.path.getmtime(n))).ljust(12).encode()
        hdr += b'0'.ljust(6); hdr += b'0'.ljust(6)
        hdr += b'644'.ljust(8)
        hdr += str(len(d)).ljust(10).encode()
        hdr += b'`\n'
        f.write(hdr + d + (b'\n' if len(d) % 2 else b''))
PYEOF
)
cp -f "$OUT/${PKG}_${VER}_all.ipk" "$OUT/${PKG}_all.ipk"
echo "Built: dist/${PKG}_${VER}_all.ipk"
