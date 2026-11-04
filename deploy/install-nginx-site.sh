#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
[ "$(id -u)" = 0 ] || { echo 'Run as root with sudo sh deploy/install-nginx-site.sh'; exit 1; }
nginx -t
curl --fail --silent --show-error http://127.0.0.1:13000/api/health >/dev/null
cert=/etc/nginx/ssl/ideal-formula.top/fullchain.crt
key=/etc/nginx/ssl/ideal-formula.top/private.key
openssl x509 -in "$cert" -noout -checkhost www.ideal-formula.top | grep -q "does match certificate"
openssl x509 -in "$cert" -noout -checkhost ideal-formula.top | grep -q "does match certificate"
openssl x509 -in "$cert" -noout -checkend 604800
public_dir=$(mktemp -d)
trap 'rm -f "$public_dir/cert.pem" "$public_dir/cert.der" "$public_dir/key.der"; rmdir "$public_dir"' EXIT HUP INT TERM
openssl x509 -in "$cert" -pubkey -noout -out "$public_dir/cert.pem"
openssl pkey -pubin -in "$public_dir/cert.pem" -outform DER -out "$public_dir/cert.der"
openssl pkey -in "$key" -pubout -outform DER -out "$public_dir/key.der"
cert_hash=$(sha256sum < "$public_dir/cert.der")
key_hash=$(sha256sum < "$public_dir/key.der")
[ "$cert_hash" = "$key_hash" ] || { echo 'Certificate and private key mismatch'; exit 1; }
site=$(readlink -f /etc/nginx/sites-enabled/pzadmin)
case "$site" in /etc/nginx/sites-available/*|/etc/nginx/sites-enabled/*) ;; *) echo 'Unexpected site path'; exit 1;; esac
[ -f "$site" ] || { echo 'Existing pzadmin site missing; inspect manually'; exit 1; }
install -d -m 700 /etc/nginx/formula-backups
backup=$(mktemp /etc/nginx/formula-backups/pzadmin.$(date -u +%Y%m%dT%H%M%SZ).XXXXXX.conf)
cp -p -- "$site" "$backup"
staged=$(mktemp "$(dirname "$site")/.formula-site.XXXXXX")
trap 'rm -f "$staged" "$public_dir/cert.pem" "$public_dir/cert.der" "$public_dir/key.der"; rmdir "$public_dir"' EXIT HUP INT TERM
install -m 644 deploy/nginx-site.conf "$staged"
mv -- "$staged" "$site"
if ! nginx -t; then
  cp -p -- "$backup" "$site"
  echo "Validation failed; original restored. Backup: $backup"
  exit 1
fi
if ! systemctl reload nginx; then
  cp -p -- "$backup" "$site"
  nginx -t && systemctl reload nginx
  echo "Reload failed; original restored. Backup: $backup"
  exit 1
fi
echo "Nginx routes Formula AI. Previous site preserved at: $backup"
echo 'Verify HTTPS from the browser before removing any old pzadmin files.'
