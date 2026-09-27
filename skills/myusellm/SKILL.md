---
name: myusellm
description: 为项目添加与特定项目配置相同的大模型参数（apihub），同时自动在项目中配置Dockerfile、Dockerbak.txt，以及本地/远程一键部署脚本（redeploy.bat / upload2remote.bat）。
---

# myusellm — 统一大模型与双部署集成脚本技能

本技能专为在其他项目中一键配置特定大模型 API 连接，并同时生成完善的 Dockerfile 容器化环境和“本地 + 远程”双环境一键部署脚本而设计。

## 适用场景与触发词
当用户提及以下需求时，应优先触发和执行此技能：
- "添加大模型 myusellm"
- "部署到远程服务器"、"生成部署脚本"
- "配置 Dockerfile 与 2个部署 bat 脚本"
- "使用特定 API 密钥和本地部署"

## 核心任务规范

当你被调用此技能时，必须自动在目标项目中执行以下 6 项核心任务：

### 任务 1：统一大模型参数配置
在目标项目中的大模型客户端初始化代码（如 API 代理路由、`lib/gemini.ts` 或 `app/api/generate/route.ts` 等）中，默认配置以下参数，无需用户再次提供：
- **API Base URL (端点)**: `https://apihub.agnes-ai.com/v1`
- **API Key (密钥)**: `sk-GUdpKQNIwwJSZQ5mYyrMnuCJBOjSbB73c2N6NcnNfk5LoKyq`

*(注意：在写到配置文件或代码中时，如果是在服务器端运行，可直接在此处写入默认，或将其注册在环境变量 `.env` 中作为默认回退)*。

---

### 任务 2：生成 `Dockerfile` 配置文件
在项目根目录下，直接创建生产级 `Dockerfile`。如果是 Next.js 应用，使用以下模版：
```dockerfile
FROM node:20-bookworm

WORKDIR /app

# 复制依赖声明文件
COPY package*.json ./

# 安装依赖，强制从源码编译 better-sqlite3，避免二进制兼容性问题（若使用了 sqlite）
RUN npm install --build-from-source=better-sqlite3

# 复制所有项目源文件
COPY . .

# 编译 Next.js
RUN npm run build

# 设置生产环境环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["npm", "run", "start"]
```

同时，在项目根目录下额外生成一份命名为 `Dockerbak.txt` 的文件，**其内容与上述 Dockerfile 必须完全一致**。

---

### 任务 3：生成本地部署脚本 `redeploy.bat`
在项目根目录下生成一个名为 `redeploy.bat` 的 Windows 批处理文件。该脚本应自动提取当前项目的名字（或从 package.json/目录名获取），设置本地运行端口（如默认 `7804:3000`）。
结构模版如下：
```batch
@echo off
echo ========================================
echo [项目名] - Docker Deployment Script (Windows)
echo ========================================
echo.

:: 设置统一的数据存储目录（根据项目名字段设定）
set "DATA_DIR=D:\docker\[项目名]\data"

echo [1/4] Building Docker image...
docker build -t [项目名]:latest .
if errorlevel 1 (
    echo [ERROR] Docker build failed. Deployment aborted.
    pause
    exit /b 1
)
echo Build successful.
echo.

echo [2/4] Stopping and removing old container...
docker stop [项目名] 2>nul
docker rm [项目名] 2>nul
echo Done.
echo.

echo [3/4] Cleaning up dangling images...
for /f "tokens=*" %%i in ('docker images [项目名] -q --filter "dangling=true" 2^>nul') do docker rmi %%i 2>nul
echo Done.
echo.

echo [4/4] Starting new container...
if not exist "%DATA_DIR%" ( mkdir "%DATA_DIR%" )

:: 启动容器
docker run -d --name [项目名] -p 7804:3000 --restart unless-stopped [项目名]:latest

if errorlevel 1 (
    echo [ERROR] Failed to start Docker container.
    pause
    exit /b 1
)
echo.

echo [验证] 等待 3 秒后检查容器运行状态...
timeout /t 3 /nobreak >nul
docker ps | findstr [项目名]
echo.

echo ========================================
echo Deployment Successful!
echo ========================================
echo Access URL: http://localhost:7804
echo ========================================
echo.
pause
```

---

### 任务 4：生成远程部署脚本 `upload2remote.bat`
在项目根目录下生成远程一键部署脚本 `upload2remote.bat`。该脚本自动将本地打包好的镜像转为 tar 包，通过 `scp` 传输至目标 Linux 服务器 `172.29.173.42`（用户 `gpzx`，密码 `9520111`），然后用 `ssh` 命令在远程停止、删除旧容器，并使用新镜像运行。
模版如下：
```batch
@echo off
echo ========================================================
echo   Deploying %IMAGE_NAME% to Remote Server
echo ========================================================
echo.

REM ====== CONFIGURABLE VARIABLES ======
set IMAGE_NAME=[项目名]
set CONTAINER_NAME=[项目名]
set CONTAINER_PORT=7804
set INTERNAL_PORT=3000
set VOLUME_MOUNT=-v "/bak/docker/[项目名]/materials.db:/app/materials.db"

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
docker build -t %IMAGE_NAME% .
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
ssh %REMOTE_USER%@%REMOTE_HOST% "mkdir -p /bak/docker/[项目名] && (if [ -d /bak/docker/[项目名]/materials.db ]; then rm -rf /bak/docker/[项目名]/materials.db; fi) && touch /bak/docker/[项目名]/materials.db && chmod -R 777 /bak/docker/[项目名]"
if errorlevel 1 (
    echo [WARNING] Remote directory and file preparation encountered issues. Continuing...
) else (
    echo [SUCCESS] Remote database directory and files prepared successfully!
)
echo.

echo [Step 8/8] Stopping existing container and running new container...
ssh %REMOTE_USER%@%REMOTE_HOST% "docker stop %CONTAINER_NAME% 2>/dev/null || true; docker rm %CONTAINER_NAME% 2>/dev/null || true; docker run -d --name %CONTAINER_NAME% -p %CONTAINER_PORT%:%INTERNAL_PORT% %VOLUME_MOUNT% --network=%NETWORK_NAME% --restart unless-stopped %IMAGE_NAME%"
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
```

---

### 任务 5：生成 `.dockerignore` 配置文件
在项目根目录下自动创建 `.dockerignore` 文件，确保在 Docker 镜像构建时排除缓存、依赖及敏感的环境变量配置，避免造成镜像体积过大或构建失败。内容模版如下：
```ignore
node_modules
.next
out
dist
build
.git
.gitignore
*.log
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*
```

---

### 任务 6：生成 `readme.md` 文件,该文件的内容是清楚描述该应用的功能和运行及使用方法

---

## 关键代码修改 with 脚本生成逻辑 (TRICKS & TIPS)
在生成这些脚本和配置时，代理应当遵循以下经验逻辑，以确保生成出来的配置文件高度自适应、无 Bug：

1. **项目自适应命名 (Auto Name Matching)**:
   - 必须通过读取目标项目的 `package.json` 中的 `"name"` 字段来替换模版中的 `[项目名]`。
   - 避免直接写死当前项目的名称。
2. **挂载卷(Volume Mount)自适应**:
   - 如果项目使用的数据库文件（如 SQLite, materials.db 等）在特定目录下，确保将其正确的路径映射 to 本地或远程的挂载卷参数中。
   - 在 `Step 7/8` 检查是否有任何数据库文件并进行宿主机的预创建，再给予 `chmod -R 777` 权限以防止远程 Docker 中 Node 容器由于无写权限而崩溃。
3. **安全注入环境变量**:
   - 创建部署文件时，可连带在运行命令中提供 `PORT=3000` 或自定义的大模型变量环境变量，从而减少对静态配置的硬编码依赖。
4. **统一全部页面和信息使用中文显示**:
   - 与技能相关的代码及页面展示必须始终保持一致，完美翻译及本土化。
