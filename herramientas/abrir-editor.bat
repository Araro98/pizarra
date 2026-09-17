@echo off
REM Abre el menu de inicio (editor, base de datos y calculadora) en el navegador,
REM sobre una COPIA de la partida de Steam.
REM Steam puede estar abierto: aqui solo se lee, no se escribe nada suyo.
REM La partida se busca sola en el Steam de este ordenador (buscar-steam.bat).
setlocal
set "TRABAJO=%~dp0..\partidas\para-editar"
set "RAIZ=%~dp0.."

call "%~dp0buscar-steam.bat"
if not defined ORIGEN goto :sin_partida

if not exist "%TRABAJO%" mkdir "%TRABAJO%"
copy /Y "%ORIGEN%" "%TRABAJO%\%FICHERO%" >nul
if errorlevel 1 goto :fallo_copia

echo.
echo   Se ha copiado tu partida de Steam (%FICHERO%) para editarla.
echo   Tu partida original NO se toca.
echo.
echo   Se va a abrir el navegador con el menu de inicio.
echo   Para cerrarlo todo, cierra esta ventana.
echo.

cd /d "%RAIZ%"
py -m ievr.servidor "partidas\para-editar"
if errorlevel 1 goto :fallo_python
exit /b 0

:sin_partida
echo No encuentro ninguna partida del juego en el Steam de este ordenador.
echo Si la tienes en otro sitio, copiala (sin renombrarla) en partidas\actual.
pause
exit /b 1

:fallo_copia
echo No he podido copiar la partida. Comprueba que el juego no la esta usando.
pause
exit /b 1

:fallo_python
echo.
echo El editor no ha podido arrancar. Copia el mensaje de arriba y pasamelo.
pause
exit /b 1
