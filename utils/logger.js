const logger = require("pino")();
const pinoHttp = require("pino-http")({ logger });


module.exports = { logger, pinoHttp };
