# syntax=docker/dockerfile:1.5

FROM node:22-bullseye
WORKDIR /app

ENV NODE_ENV=development
ENV VITE_SIGNALING_WS_URL=ws://localhost:8080/ws

# Install dependencies using cached layers when package manifests do not change
COPY package.json package-lock.json* .
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
