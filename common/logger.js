const bunyan = require("bunyan");

module.exports = class Logger {

  get DEFAULT_LOGGER_NAME() {
    return "UNKNOWN_LOGGER";
  }

  constructor(config) {
    let bun = bunyan.createLogger({name: config.name || this.DEFAULT_LOGGER_NAME});
    this.error = bun.error.bind(bun);
    this.warning = bun.warn.bind(bun);
    this.info = bun.info.bind(bun);
    this.level = bun.level.bind(bun);
    this.debug = bun.debug.bind(bun);
    this.trace = (lMethod, lRequestUrl, lBody, lResponseBody, lResponseStatus) => {
      bun.trace({
        method:         lMethod,
        requestUrl:     lRequestUrl,
        body:           lBody,
        responseBody:   lResponseBody,
        responseStatus: lResponseStatus
      });
    };
    this.serializers = bun.serializers;
    this.constructor.stdSerializers = bun.constructor.stdSerializers;
    this.child = bun.child;
    this.close = function () { /* bunyan's loggers do not need to be closed */ };
  }

};
