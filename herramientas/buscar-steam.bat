@echo off
REM Busca la partida del juego en el Steam de ESTE ordenador y deja en el
REM entorno de quien lo llama (con "call"):
REM    DESTINO  = la carpeta ...\userdata\<cuenta>\2799860\remote
REM    FICHERO  = el nombre de la partida (XXXXXXXX-USERDATALIVE)
REM    ORIGEN   = la partida entera (DESTINO\FICHERO)
REM Sin rutas de nadie escritas: la carpeta de Steam sale del registro de
REM Windows y, si no, de las carpetas de siempre en cada unidad (NOTAS O-201).
REM Si hay varias cuentas con el juego se queda con la de la partida mas nueva.
set "DESTINO="
set "FICHERO="
set "ORIGEN="
set "STEAMDIR="
for /f "tokens=2,*" %%A in ('reg query "HKCU\Software\Valve\Steam" /v SteamPath 2^>nul ^| "%SystemRoot%\System32\find.exe" /I "SteamPath"') do set "STEAMDIR=%%B"
if defined STEAMDIR set "STEAMDIR=%STEAMDIR:/=\%"
if defined STEAMDIR call :mirar "%STEAMDIR%\userdata"
for %%U in (C D E F G H) do (
  call :mirar "%%U:\Program Files (x86)\Steam\userdata"
  call :mirar "%%U:\Steam\userdata"
  call :mirar "%%U:\steam\userdata"
  call :mirar "%%U:\Juegos\Steam\userdata"
  call :mirar "%%U:\Games\Steam\userdata"
)
exit /b 0

:mirar
if not exist "%~1" exit /b 0
for /d %%C in ("%~1\*") do (
  if exist "%%C\2799860\remote" (
    for /f "delims=" %%F in ('dir /b /o-d "%%C\2799860\remote\*-USERDATALIVE" 2^>nul') do (
      if not defined FICHERO (
        set "DESTINO=%%C\2799860\remote"
        set "FICHERO=%%F"
        set "ORIGEN=%%C\2799860\remote\%%F"
      )
    )
  )
)
exit /b 0
