FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production=false

# Copy source
COPY tsconfig.json ./
COPY scripts/ ./scripts/
COPY config/ ./config/
COPY tasks/ ./tasks/

# Create runtime dirs
RUN mkdir -p runtime/worker-01/results runtime/worker-01/transactions runtime/worker-01/state

CMD ["npm", "start"]
