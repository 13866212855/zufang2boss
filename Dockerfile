FROM node:20-bookworm

WORKDIR /app

# 复制依赖声明文件与 npm 配置文件（package-lock.json 会被 package*.json 通配一并复制）
COPY package*.json .npmrc* ./

# 安装依赖 —— 抗 TLS 抖动写法（Windows + Docker Desktop/WSL2 链路下并发 TLS 流偶发被破坏）
# 要点：
#   1) --mount=type=cache 把 /root/.npm 缓存持久化：重试与后续构建复用已下载的包，失败不清零
#   2) maxsockets=1 串行化下载，从根上规避 ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC
#   3) 循环重试 6 次，全部失败后切换腾讯云镜像源兜底
RUN --mount=type=cache,target=/root/.npm \
    npm config set registry https://registry.npmmirror.com && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set maxsockets 1 && \
    npm config set strict-ssl false && \
    ok=0; \
    for i in 1 2 3 4 5 6; do \
        echo "=== npm install attempt $i/6 ==="; \
        if npm install --legacy-peer-deps --no-audit --no-fund; then ok=1; break; fi; \
        echo "=== attempt $i failed, wait 15s then retry ==="; \
        sleep 15; \
    done; \
    if [ "$ok" != "1" ]; then \
        echo "=== npmmirror failed 6 times, fallback to tencent mirror ==="; \
        npm install --registry=https://mirrors.cloud.tencent.com/npm/ --legacy-peer-deps --no-audit --no-fund; \
    fi

# 复制所有项目源文件
COPY . .

# 编译项目（vite build，无需网络）
RUN npm run build

# 创建持久化数据与文件上传目录
RUN mkdir -p /app/data /app/uploads

# 设置生产环境环境变量（注意：必须在 npm install / build 之后设置，
# 否则 npm install 会跳过 devDependencies 导致 vite build 失败）
ENV NODE_ENV=production
ENV PORT=3000

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["npm", "run", "start"]
