FROM node:18

# Install Chromium dependencies
RUN apt-get update && apt-get install -y \
  chromium \
  && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer where Chromium is
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
