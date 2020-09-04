FROM node:10-alpine
RUN mkdir -p /src/app
WORKDIR /src/app
COPY src /src/app
RUN npm install
COPY . /src/app
EXPOSE 8080
CMD [ "npm", "start" ]
