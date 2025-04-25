# 使用官方 Python 3.9 slim 作为基础镜像
FROM python:3.9-slim

# 设置工作目录
WORKDIR /app

# 将依赖文件复制并安装依赖
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 复制项目代码
COPY . .

# 创建并切换到非 root 用户
RUN adduser --disabled-password --gecos '' appuser && chown -R appuser /app
USER appuser

# 暴露应用运行的端口
EXPOSE 5000

# 使用环境变量传递配置
ENV FLASK_ENV=production
# 可以通过设置 APP_PASSWORD 环境变量来启用访问密码保护
# ENV APP_PASSWORD=your_password

# 设置健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s \
  CMD curl -f http://localhost:5000/health || exit 1

# 启动命令
CMD ["python", "run.py"]
