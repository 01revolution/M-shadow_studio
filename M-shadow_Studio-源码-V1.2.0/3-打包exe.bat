@echo off
chcp 65001 >nul
title M-shadow Studio - 打包 exe
pushd "%~dp0"
if not exist "node_modules\electron" goto NODEPS
echo ============================================
echo   打包成 Windows 安装包（exe）
echo ============================================
echo.
echo 产物会输出到 release 目录，文件名形如：
echo   ShadowingStudio Setup 1.0.0.exe
echo.
echo 打包过程会下载约 100MB 的 Windows 版 Electron，
echo 网络不稳会失败，重试一次通常就好。
echo.
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
call npm run dist:win > build.log 2>&1
if errorlevel 1 goto FAIL
echo.
echo [成功] 打包完成，请查看 release 目录。
echo.
pause
popd
exit /b 0

:FAIL
echo.
echo [失败] 打包出错，详情见 build.log
echo 常见原因：网络中断、磁盘空间不足、杀毒软件拦截。
echo 重试一次通常就能成功。
echo.
pause
popd
exit /b 1

:NODEPS
echo [提示] 还没有安装依赖，请先运行「1-安装依赖.bat」。
echo.
pause
popd
exit /b 1
