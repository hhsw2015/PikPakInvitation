## 部署方式

### 1. 源码运行

```bash
# 安装依赖
pip install -r requirements.txt

# 运行应用
python run.py
```

### 2. Docker 部署

```bash
# 使用 docker-compose 部署
docker-compose up -d
```


## 访问密码保护

部署在公网时推荐开启密码保护：

- 如果未设置密码，无需密码可直接访问
- 如果设置了密码，访问时需要输入对应的密码

### 设置方法

1. **命令行参数方式（推荐）**：
   ```bash
   # 直接通过命令行参数设置密码
   python run.py --password 123456
   ```

2. **环境变量方式**：
   ```bash
   # Linux/Mac
   export APP_PASSWORD=your_password
   python run.py
   
   # Windows CMD
   set APP_PASSWORD=your_password
   python run.py
   
   # Windows PowerShell
   $env:APP_PASSWORD = "your_password"
   python run.py
   ```

3. **Docker 部署**：
   在 `docker-compose.yml` 中取消注释并设置：
   ```yaml
   environment:
     - APP_PASSWORD=your_password
   ```
