# Stage 1: Build the React application
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package dependencies
COPY package*.json ./

# Install all dependencies (including devDependencies for Vite)
RUN npm ci

# Copy the rest of the application codebase
COPY . .

# Build the application for production
RUN npm run build

# Stage 2: Serve the compiled front-end
FROM nginx:alpine

# Copy the compiled build from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Cloud Run expects the container to listen on Port 8080
EXPOSE 8080

# Run Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
