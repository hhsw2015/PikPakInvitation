# PikPak 自动邀请

一个帮助管理PikPak邀请的工具，包含前端界面和后端服务。

**理论上输入账号后，一下都不用点，等着把列表里面账号注册完成就行**

## 项目结构

- `frontend/`: 前端代码，使用 pnpm 管理依赖
- 后端: Python 实现的服务

## 环境变量
MAIL_POINT_API_URL 使用：https://github.com/HChaoHui/msOauth2api 部署后获得

## 部署方式

### 前端部署

```bash
# 进入前端目录
cd frontend

# 安装依赖
pnpm install

# 开发模式运行
pnpm dev

# 构建生产版本
pnpm build
```

### 后端部署

#### 1. 环境变量
复制 .env.example 到 .env

修改环境变量的值

```bash
MAIL_POINT_API_URL=https://your-endpoint.com
```

#### 2. 源码运行

```bash
# 安装依赖
pip install -r requirements.txt

# 运行应用
python run.py
```

### Docker 部署

项目提供了 Dockerfile，可以一键构建包含前后端的完整应用。

#### 运行 Docker 容器

```bash
# 创建并运行容器
docker run -d \
  --name pikpak-auto \
  -p 5000:5000 \
  -e MAIL_POINT_API_URL=https://your-endpoint.com \
  -v $(pwd)/account:/app/account \
  vichus/pikpak-invitation:latest
```

参数说明：
- `-d`: 后台运行容器
- `-p 5000:5000`: 将容器内的 5000 端口映射到主机的 5000 端口
- `-e MAIL_POINT_API_URL=...`: 设置环境变量
- `-v $(pwd)/account:/app/account`: 将本地 account 目录挂载到容器内，保存账号数据

#### 4. 查看容器日志

```bash
docker logs -f pikpak-auto
```

#### 5. 停止和重启容器

```bash
# 停止容器
docker stop pikpak-auto

# 重启容器
docker start pikpak-auto
```

注意：Windows 用户在使用 PowerShell 时，挂载卷的命令可能需要修改为：
```powershell
docker run -d --name pikpak-auto -p 5000:5000 -e MAIL_POINT_API_URL=https://your-endpoint.com -v ${PWD}/account:/app/account vichus/pikpak-invitation
```

### Docker Compose 部署

如果你更喜欢使用 Docker Compose 进行部署，请按照以下步骤操作：

#### 1. 启动服务

启动前记得修改 `docker-compose.yml` 的环境变量

```bash
# 在项目根目录下启动服务
docker-compose up -d
```

#### 2. 查看日志

```bash
# 查看服务日志
docker-compose logs -f
```

#### 3. 停止和重启服务

```bash
# 停止服务
docker-compose down

# 重启服务
docker-compose up -d
```

鸣谢：

[Pikpak-Auto-Invitation](https://github.com/Bear-biscuit/Pikpak-Auto-Invitation)

[纸鸢地址发布页](https://kiteyuan.info/)

[msOauth2api](https://github.com/HChaoHui/msOauth2api)