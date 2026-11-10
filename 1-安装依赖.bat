@echo off
chcp 65001 >nul
title M-shadow Studio - 安装依赖
pushd "%~dp0"
cls
echo ============================================
echo   M-shadow Studio - 安装依赖（只需跑一次）
echo ============================================
echo 当前目录：%CD%
echo.
echo [1/3] 检查 Node.js ...
where node >nul 2>nul
if errorlevel 1 goto NONODE
for /f "tokens=*" %%i in ('node -v') do echo       已检测到 Node.js %%i
echo.
echo [2/3] 开始安装依赖（首次约 3-8 分钟，屏幕上会有滚动日志）
echo       如果这一屏长时间不动，说明正在下载 Electron 运行时，耐心等一下。
echo.
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { npm install --registry=https://registry.npmmirror.com 2>&1 | Tee-Object -FilePath install.log }"
if errorlevel 1 goto FAIL
echo.
echo [3/3] 安装完成。
echo 现在双击「2-启动程序.bat」就能用了。
echo.
pause
popd
exit /b 0

:NONODE
echo.
echo [错误] 这台电脑上没有找到 Node.js。
echo        请先安装 Node.js 20 或更高版本：https://nodejs.org/zh-cn
echo        装的时候一路点「下一步」，装完重新双击本脚本。
echo.
pause
popd
exit /b 1

:FAIL
echo.
echo [失败] 依赖安装出错，完整日志在 install.log
echo        常见原因：网络中断、杀毒软件拦截、npm 源不可用。
echo        把 install.log 发给我，我帮你定位。
echo.
pause
popd
exit /b 1
