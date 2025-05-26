FROM node:lts-alpine AS frontend-builder

WORKDIR /app/frontend

RUN npm install -g pnpm

COPY frontend/package.json frontend/pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY frontend/ ./

RUN pnpm build

FROM python:3.10-slim AS final

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

RUN mkdir account

RUN mkdir -p templates static

# Create empty database file to ensure proper mounting
RUN touch accounts.db

COPY run.py ./
COPY utils/ ./utils/

COPY --from=frontend-builder /app/frontend/dist/index.html ./templates/
COPY --from=frontend-builder /app/frontend/dist/* ./static/

EXPOSE 5000

CMD ["python", "run.py"] 