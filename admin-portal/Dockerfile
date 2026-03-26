# Pro-curo Licence Server — Admin Portal (Development)
# Runs Vite dev server with hot-reload inside Docker

FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json ./
RUN rm -f package-lock.json && npm install

# Copy source code
COPY . .

EXPOSE 5174

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
