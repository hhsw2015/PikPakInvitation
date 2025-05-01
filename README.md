# PikPak 自动邀请

一个帮助管理PikPak邀请的工具，包含前端界面和后端服务。

**理论上输入账号后，一下都不用点，等着把列表里面账号注册完成就行**

## 项目结构

- `frontend/`: 前端代码，使用 pnpm 管理依赖
- 后端: Python 实现的服务

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

#### 1. 源码运行

```bash
# 安装依赖
pip install -r requirements.txt

# 运行应用
python run.py
```