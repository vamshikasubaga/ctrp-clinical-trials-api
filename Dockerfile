FROM node:boron

# Create app directory
RUN mkdir -p /usr/src/clinical-trials-api
WORKDIR /usr/src/clinical-trials-api

# Install app dependencies
COPY . /usr/src/clinical-trials-api
RUN cd /usr/src/clinical-trials-api/common && npm install
RUN ls -alht

RUN cd common && npm install
RUN ls -alht
RUN cd api && npm install

# Bundle app source
#COPY . /usr/src/app

EXPOSE 3000
CMD cd /usr/src/clinical-trials-api/api && npm start
