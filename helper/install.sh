#!/bin/zsh
# Installs the Now Playing helper for Proto Database's Winamp skin.
# Copies two small scripts to ~/Library/Application Support/Proto Database and
# asks launchd to start them on demand when the page connects to 127.0.0.1:47823.
set -e
label=com.protodatabase.nowplaying
port=47823
support="$HOME/Library/Application Support/Proto Database"
plist="$HOME/Library/LaunchAgents/$label.plist"
here=${0:A:h}

mkdir -p "$support" "$HOME/Library/LaunchAgents"
cp "$here/nowplaying.sh" "$here/nowplaying.js" "$support/"

cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>$support/nowplaying.sh</string>
  </array>
  <key>inetdCompatibility</key>
  <dict>
    <key>Wait</key>
    <false/>
  </dict>
  <key>Sockets</key>
  <dict>
    <key>Listeners</key>
    <dict>
      <key>SockNodeName</key>
      <string>127.0.0.1</string>
      <key>SockServiceName</key>
      <string>$port</string>
      <key>SockType</key>
      <string>stream</string>
    </dict>
  </dict>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist"

echo "Installed. Checking it answers:"
curl -s --max-time 5 "http://127.0.0.1:$port/" && echo
echo "The first time it looks at Spotify, Music or a browser, macOS asks once to let it read that app. Click OK."
