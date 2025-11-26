"use strict";
/**
 * Simple logging utility
 * Can be replaced with Winston or Pino in production
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel["INFO"] = "INFO";
    LogLevel["WARN"] = "WARN";
    LogLevel["ERROR"] = "ERROR";
    LogLevel["DEBUG"] = "DEBUG";
})(LogLevel || (LogLevel = {}));
var Logger = /** @class */ (function () {
    function Logger() {
    }
    Logger.prototype.getTimestamp = function () {
        return new Date().toISOString();
    };
    Logger.prototype.formatMessage = function (level, message) {
        return "[".concat(this.getTimestamp(), "] [").concat(level, "] ").concat(message);
    };
    /**
     * Log informational messages
     */
    Logger.prototype.info = function (message) {
        console.log(this.formatMessage(LogLevel.INFO, message));
    };
    /**
     * Log warning messages
     */
    Logger.prototype.warn = function (message) {
        console.warn(this.formatMessage(LogLevel.WARN, message));
    };
    /**
     * Log error messages
     */
    Logger.prototype.error = function (message) {
        console.error(this.formatMessage(LogLevel.ERROR, message));
    };
    /**
     * Log debug messages (only in development)
     */
    Logger.prototype.debug = function (message) {
        if (process.env.NODE_ENV === 'development') {
            console.debug(this.formatMessage(LogLevel.DEBUG, message));
        }
    };
    /**
     * Log with custom data object
     */
    Logger.prototype.logWithData = function (level, message, data) {
        var formattedMessage = this.formatMessage(level, message);
        console.log(formattedMessage, data);
    };
    return Logger;
}());
// Export singleton instance
exports.logger = new Logger();
