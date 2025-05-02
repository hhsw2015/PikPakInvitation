# Stage 1: Build frontend assets
FROM node:lts-alpine AS frontend-builder

WORKDIR /app/frontend

# Install pnpm
RUN npm install -g pnpm

# Copy package manifests
COPY frontend/package.json frontend/pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of frontend source code
COPY frontend/ ./

# Build frontend
RUN pnpm build

# Stage 2: Setup backend runtime environment
FROM python:3.10-slim AS final

WORKDIR /app

# Install backend dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Create accounts directory
RUN mkdir accounts

# Create Flask required directories
RUN mkdir -p templates static

# Copy specific backend code
COPY run.py ./
COPY utils/ ./utils/
# If backend code is in a subdirectory, e.g., 'backend/', use:
# COPY backend/ ./backend/
# WORKDIR /app/backend

# Copy built frontend assets from builder stage properly for Flask
# HTML template goes to templates directory
COPY --from=frontend-builder /app/frontend/dist/index.html ./templates/
# Static assets go to static directory
COPY --from=frontend-builder /app/frontend/dist/vite.svg ./static/
COPY --from=frontend-builder /app/frontend/dist/assets ./static/assets/

# IMPORTANT: Provide actual environment variables at runtime!
# Do NOT commit sensitive data into the image.
# The application should read configuration from environment variables.

# Expose port (Assuming backend runs on port 8000)
EXPOSE 5000

# Command to run the application
# Adjust 'run.py' if your main script has a different name
CMD ["python", "run.py"] 