FROM node:boron

# Create app directory
RUN mkdir -p /usr/src/clinical-trials-api
WORKDIR /usr/src/clinical-trials-api

# Install app dependencies
COPY . /usr/src/clinical-trials-api
RUN cd /usr/src/clinical-trials-api/common && npm install
RUN ls -alht

RUN cd search && npm install
RUN cd common && npm install
RUN ls -alht
RUN cd search/api && npm install
RUN cd search/client && npm install
RUN cd search/index && npm install

# Bundle app source
#COPY . /usr/src/app

EXPOSE 3000
CMD cd /usr/src/clinical-trials-api/search/api && NODE_ENV=${NODE_ENV} AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} npm start
