@echo off
echo =====================================
echo Tab Recorder Backend Server
echo =====================================
echo.

cd backend

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

if not exist ".env" (
    echo Creating .env file...
    copy .env.example .env
    echo.
)

echo Starting server...
echo Server will run on http://localhost:3000
echo Press Ctrl+C to stop
echo.

call npm start
