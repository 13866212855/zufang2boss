@echo off
chcp 65001 >nul
echo ========================================================
echo   Deploying %IMAGE_NAME% to Remote Server
echo ========================================================
echo.

REM ====== CONFIGURABLE VARIABLES ======
set IMAGE_NAME=zufang2bos
set CONTAINER_NAME=zufang2bos
set CONTAINER_PORT=7864
set INTERNAL_PORT=3000
set VOLUME_MOUNT=-v "/bak/docker/zufang2bos/data:/app/data" -v "/bak/docker/zufang2bos/uploads:/app/uploads"

set TAR_DIR=d:\temp\tar
set TAR_FILE=%TAR_DIR%\%IMAGE_NAME%.tar

set REMOTE_USER=gpzx
set REMOTE_HOST=172.29.173.42
set REMOTE_PASSWORD=9520111
set REMOTE_TAR_DIR=/bak/tar
set NETWORK_NAME=mynet

echo [Step 1/8] Running MCP Server script if exists...
if exist "skills\my_create_mcp\my_create_mcp.js" (
    node skills\my_create_mcp\my_create_mcp.js
    if errorlevel 1 (
        echo [ERROR] MCP Server generation script failed!
        pause
        exit /b 1
    )
) else (
    echo [INFO] MCP Server generation script not found, skipping.
)
echo.

echo [Step 2/8] Checking local temp directories...
if not exist "%TAR_DIR%" (
    mkdir "%TAR_DIR%"
    echo Created directory: %TAR_DIR%
) else (
    echo Directory already exists: %TAR_DIR%
)
echo.

echo [Step 3/8] Building Docker image locally...
echo Building image %IMAGE_NAME% with npmmirror acceleration...
docker build --build-arg NPM_REGISTRY=https://registry.npmmirror.com -t %IMAGE_NAME% .
if errorlevel 1 (
    echo [ERROR] Local Docker image build failed!
    pause
    exit /b 1
)
echo [SUCCESS] Docker image built successfully!
echo.

echo [Step 4/8] Saving Docker image to tar file...
docker save -o "%TAR_FILE%" %IMAGE_NAME%
if errorlevel 1 (
    echo [ERROR] Docker image save failed!
    pause
    exit /b 1
)
echo [SUCCESS] Image saved to %TAR_FILE%
echo.

echo [Step 5/8] Uploading image tar to remote server...
echo Uploading to %REMOTE_USER%@%REMOTE_HOST%:%REMOTE_TAR_DIR%/
echo Note: If prompted for password, enter: %REMOTE_PASSWORD%
scp "%TAR_FILE%" %REMOTE_USER%@%REMOTE_HOST%:%REMOTE_TAR_DIR%/
if errorlevel 1 (
    echo [ERROR] SCP upload failed! Please verify OpenSSH client and remote server accessibility.
    pause
    exit /b 1
)
echo [SUCCESS] File uploaded successfully!
echo.

echo [Step 6/8] Loading image on remote server...
ssh %REMOTE_USER%@%REMOTE_HOST% "docker load -i %REMOTE_TAR_DIR%/%IMAGE_NAME%.tar"
if errorlevel 1 (
    echo [ERROR] Remote docker load failed!
    pause
    exit /b 1
)
echo [SUCCESS] Remote docker load succeeded!
echo.

echo [Step 7/8] Preparing remote directories and permissions...
ssh %REMOTE_USER%@%REMOTE_HOST% "mkdir -p /bak/docker/zufang2bos/data /bak/docker/zufang2bos/uploads && chmod -R 777 /bak/docker/zufang2bos"
if errorlevel 1 (
    echo [WARNING] Remote directory and file preparation encountered issues. Continuing...
) else (
    echo [SUCCESS] Remote uploads and data directories prepared successfully!
)
echo.

echo [Step 8/8] Stopping existing container and running new container...
ssh %REMOTE_USER%@%REMOTE_HOST% "docker stop %CONTAINER_NAME% 2>/dev/null || true; docker rm %CONTAINER_NAME% 2>/dev/null || true; docker run -d --name %CONTAINER_NAME% -p %CONTAINER_PORT%:%INTERNAL_PORT% %VOLUME_MOUNT% -e DATABASE_URL='postgresql://neondb_owner:npg_KLQv36ezVyYG@ep-round-credit-b584r680-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require' --network=%NETWORK_NAME% --restart unless-stopped %IMAGE_NAME%"
if errorlevel 1 (
    echo [ERROR] Failed to start remote container!
    pause
    exit /b 1
)
echo [SUCCESS] Remote container started successfully!
echo.

echo [Verification] Waiting 3 seconds to check container status...
timeout /t 3 /nobreak >nul
ssh %REMOTE_USER%@%REMOTE_HOST% "docker ps | grep %CONTAINER_NAME%"
echo.

echo ========================================================
echo   Deployment Completed Successfully!
echo ========================================================
echo Image Name   : %IMAGE_NAME%
echo Container    : %CONTAINER_NAME%
echo Access URL   : http://%REMOTE_HOST%:%CONTAINER_PORT%
echo Remote Tar   : %REMOTE_HOST%:%REMOTE_TAR_DIR%/%IMAGE_NAME%.tar
echo.
pause
