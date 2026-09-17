@echo off
REM Copia una partida editada a la carpeta de Steam.
REM Se niega a hacerlo si Steam esta abierto, porque la nube la sobrescribiria.
REM No lleva ninguna ruta escrita: busca Steam en el registro de Windows y la
REM cuenta que tenga el juego (NOTAS O-201). El editor tiene el mismo boton
REM ("Instalar en Steam"), asi que esto es solo por si se prefiere a mano.
setlocal EnableDelayedExpansion
set "EDITADAS=%~dp0..\partidas\editadas"
set "COPIAS=%~dp0..\partidas\antes-de-instalar"

call "%~dp0buscar-steam.bat"
if not defined DESTINO goto :sin_steam
if not defined FICHERO goto :sin_steam

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
set "ORIGEN=%EDITADAS%\%NOMBRE%\%FICHERO%"
if not exist "%ORIGEN%" goto :no_existe

set "SELLO=%DATE:/=-%_%TIME::=-%"
set "SELLO=%SELLO: =0%"
set "SELLO=%SELLO:,=-%"
if not exist "%COPIAS%\%SELLO%" mkdir "%COPIAS%\%SELLO%"
copy /Y "%DESTINO%\%FICHERO%" "%COPIAS%\%SELLO%\%FICHERO%" >nul
echo Tu partida actual queda guardada en:
echo    partidas\antes-de-instalar\%SELLO%
echo.

copy /Y "%ORIGEN%" "%DESTINO%\%FICHERO%" >nul
if errorlevel 1 goto :fallo
echo Instalada "%NOMBRE%" en %DESTINO%. Ya puedes abrir Steam y el juego.
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
echo No encuentro ninguna partida del juego en el Steam de este ordenador.
if "%~1"=="" pause
exit /b 1

:no_existe
echo No existe la partida editada "%NOMBRE%" (busco %ORIGEN%).
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
