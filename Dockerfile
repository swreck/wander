FROM node:20

WORKDIR /app

# Build arg for Vite env vars (set in Railway)
ARG VITE_GOOGLE_MAPS_API_KEY
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY

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
