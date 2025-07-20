#!/bin/bash

SPOTIFY_STATUS=$(osascript -e 'tell application "Spotify" to get player state')

if [ "$SPOTIFY_STATUS" = "playing" ]; then
    SPOTIFY="$(osascript -e 'tell application "Spotify" to get artist of current track') - $(osascript -e 'tell application "Spotify" to get name of current track')"
    sketchybar --set "$NAME" icon="󰓇" label="$SPOTIFY | "
else
    sketchybar --set "$NAME" icon="󰓇" label="Not playing"
fi
