#!/bin/sh
# Starts a small local web server so the 3D warehouse can load.
# Then open http://localhost:8000
cd "$(dirname "$0")"
python3 -m http.server 8000
