@echo off
REM Starts a small local web server so the 3D warehouse can load.
REM Needs Python installed. Then open http://localhost:8000
cd /d "%~dp0"
start "" http://localhost:8000
python -m http.server 8000
