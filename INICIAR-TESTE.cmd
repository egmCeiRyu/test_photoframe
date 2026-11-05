@echo off
cd /d "%~dp0"
echo Abra http://localhost:8765/photoframe.html
echo Para testar em celular, use hospedagem HTTPS.
start "" "http://localhost:8765/photoframe.html"
python -m http.server 8765 --bind 127.0.0.1
