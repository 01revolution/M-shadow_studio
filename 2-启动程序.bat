@echo off
chcp 65001 >nul
title M-shadow Studio
pushd "%~dp0"
if not exist "node_modules\electron" goto NODEPS
if not exist "dist\index.html" (
  echo 正在编译界面...
  call npm run build
)
echo 正在启动 M-shadow Studio，窗口稍后弹出…
echo （这个黑窗口不要关，关掉就等于退出程序；关闭应用窗口后它会自动结束）
echo.
call npm start
popd
pause
exit /b 0

:NODEPS
echo [提示] 还没有安装依赖。
echo 请先双击「1-安装依赖.bat」，等它跑完再运行本脚本。
echo.
pause
popd
exit /b 1
