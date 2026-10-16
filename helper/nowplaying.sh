#!/bin/zsh
# Answers one request from Proto Database's Winamp skin with what's playing.
# launchd starts this only when the page connects (the connection is stdin/stdout)
# and it exits right after answering, so nothing stays running.
exec 2>/dev/null

IFS= read -r -t 2 request || exit 0
method=${request%% *}
# Read past the request headers.
while IFS= read -r -t 2 line; do
  [[ -z ${line%$'\r'} ]] && break
done

# Any page may ask (the app is opened as a local file); private-network header for Chrome.
headers=$'Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET\r\nAccess-Control-Allow-Private-Network: true\r\nCache-Control: no-store\r\nConnection: close\r\n'

if [[ $method == OPTIONS ]]; then
  printf 'HTTP/1.1 204 No Content\r\n%s\r\n' "$headers"
  exit 0
fi

# "/?web=0" from the page means: players only, don't look at browser tabs.
target=${${request#* }%% *}
args=()
[[ $target == *web=0* ]] && args=(web=0)

body=$(/usr/bin/osascript -l JavaScript "${0:A:h}/nowplaying.js" $args)
[[ $body == \{* ]] || body='{"playing":false}'
printf 'HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\n%s\r\n%s' "$headers" "$body"
