FROM node:18-slim

WORKDIR /app

# Copy everything
COPY . .

# Install and build frontend
WORKDIR /app/frontend
RUN npm install --include=dev
RUN npx vite build
RUN mkdir -p /app/backend/public && cp -r dist/* /app/backend/public/

# Install and build backend
WORKDIR /app/backend
RUN npm install --include=dev
RUN npx prisma generate
RUN npx tsc

# Runtime
WORKDIR /app/backend
CMD ["node", "dist/index.js"]
