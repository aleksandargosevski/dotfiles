#!/bin/bash

sketchybar --add item spotify right \
           --set spotify icon.color=$GREEN \
                         update_freq=5 \
                         script="$PLUGIN_DIR/spotify.sh"
