@echo off
REM Copia una partida editada a la carpeta de Steam.
REM Se niega a hacerlo si Steam esta abierto, porque la nube la sobrescribiria.
setlocal
set "DESTINO=F:\steam\userdata\143274881\2799860\remote"
set "EDITADAS=%~dp0..\partidas\editadas"
set "COPIAS=%~dp0..\partidas\antes-de-instalar"

if not exist "%DESTINO%\002AB8F4-USERDATALIVE" goto :sin_steam

REM Se vuelca la lista entera a un fichero y se busca ahi, sin filtros ni
REM tuberias. Con filtro, cuando NO hay proceso tasklist contesta "INFO: No
REM tasks are running..." repitiendo el nombre buscado, y la busqueda daria
REM siempre positivo. Y find.exe va con ruta completa porque si esto se lanza
REM desde otra consola otro "find" distinto puede adelantarse.
set "LISTA=%TEMP%\ievr_procesos.txt"
tasklist /NH > "%LISTA%" 2>nul
"%SystemRoot%\System32\find.exe" /I "steam.exe" "%LISTA%" >nul 2>&1
set "HAY_STEAM=%errorlevel%"
del "%LISTA%" 2>nul
if "%HAY_STEAM%"=="0" goto :steam_abierto

set "NOMBRE=%~1"
if not defined NOMBRE goto :elegir
goto :tengo_nombre

:elegir
echo Partidas editadas disponibles:
echo.
for /d %%D in ("%EDITADAS%\*") do echo    %%~nxD
echo.
set /p "NOMBRE=Cual instalo: "
if not defined NOMBRE goto :sin_nombre

:tengo_nombre
set "ORIGEN=%EDITADAS%\%NOMBRE%\002AB8F4-USERDATALIVE"
if not exist "%ORIGEN%" goto :no_existe

REM copia de seguridad de lo que hay ahora, con fecha y hora
set "SELLO=%DATE:/=-%_%TIME::=-%"
set "SELLO=%SELLO: =0%"
set "SELLO=%SELLO:,=-%"
if not exist "%COPIAS%\%SELLO%" mkdir "%COPIAS%\%SELLO%"
copy /Y "%DESTINO%\002AB8F4-USERDATALIVE" "%COPIAS%\%SELLO%\002AB8F4-USERDATALIVE" >nul
echo Tu partida actual queda guardada en:
echo    partidas\antes-de-instalar\%SELLO%
echo.

copy /Y "%ORIGEN%" "%DESTINO%\002AB8F4-USERDATALIVE" >nul
if errorlevel 1 goto :fallo
echo Instalada "%NOMBRE%". Ya puedes abrir Steam y el juego.
echo.
if "%~1"=="" pause
exit /b 0

:steam_abierto
echo.
echo   STEAM ESTA ABIERTO. No copio nada.
echo.
echo   Cierra Steam del todo: boton derecho en su icono junto al reloj, Salir.
echo   Si lo dejas abierto, la nube de Steam sobrescribe la partida y parece
echo   que el editor no funciona.
echo.
if "%~1"=="" pause
exit /b 1

:sin_steam
echo No encuentro la partida de Steam en:
echo    %DESTINO%
if "%~1"=="" pause
exit /b 1

:no_existe
echo No existe la partida editada "%NOMBRE%".
if "%~1"=="" pause
exit /b 1

:sin_nombre
echo Hace falta un nombre.
if "%~1"=="" pause
exit /b 1

:fallo
echo Fallo al copiar.
if "%~1"=="" pause
exit /b 1
