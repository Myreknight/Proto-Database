#!/bin/zsh
# Removes the Now Playing helper completely.
label=com.protodatabase.nowplaying
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$label.plist"
rm -f "$HOME/Library/Application Support/Proto Database/nowplaying.sh" "$HOME/Library/Application Support/Proto Database/nowplaying.js"
rmdir "$HOME/Library/Application Support/Proto Database" 2>/dev/null || true
echo "Removed the Now Playing helper."
