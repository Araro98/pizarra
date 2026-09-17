@echo off
REM Copia la partida actual de Steam a partidas\rondas\<nombre>\
REM No toca nada del juego: solo copia hacia aqui. Es seguro con Steam abierto.
REM La partida se busca sola en el Steam de este ordenador (buscar-steam.bat).
setlocal
set "DESTINO_BASE=%~dp0..\partidas\rondas"

call "%~dp0buscar-steam.bat"
if not defined ORIGEN goto :sin_partida

set "NOMBRE=%~1"
if not defined NOMBRE set /p "NOMBRE=Nombre para esta copia, por ejemplo 01-base: "
if not defined NOMBRE goto :sin_nombre

set "DESTINO=%DESTINO_BASE%\%NOMBRE%"
if exist "%DESTINO%\%FICHERO%" goto :ya_existe

if not exist "%DESTINO%" mkdir "%DESTINO%"
copy /Y "%ORIGEN%" "%DESTINO%\%FICHERO%" >nul
if errorlevel 1 goto :fallo

echo.
echo Copiada como "%NOMBRE%".
echo El nombre del fichero NO se ha cambiado: es la clave de cifrado.
echo.
if "%~1"=="" pause
exit /b 0

:sin_partida
echo No encuentro ninguna partida del juego en el Steam de este ordenador.
if "%~1"=="" pause
exit /b 1

:sin_nombre
echo Hace falta un nombre.
if "%~1"=="" pause
exit /b 1

:ya_existe
echo Ya existe una copia llamada "%NOMBRE%". Usa otro nombre.
if "%~1"=="" pause
exit /b 1

:fallo
echo Fallo al copiar.
if "%~1"=="" pause
exit /b 1
