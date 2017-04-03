"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var mega = require("mega");
var debug = require("debug")("eMCloud::Mega");
var events_1 = require("events");
var Mega = (function (_super) {
    __extends(Mega, _super);
    function Mega(credentials) {
        var _this = _super.call(this) || this;
        _this.creds = credentials;
        return _this;
        //store credentials, they can be username/password or OAuth Tokens etc.
    }
    Mega.getURL = function () {
        //return the url on which the user will be redirected for credentials, can be OAuth Consent Page or a page on server itself.
        return "/login/mega";
    };
    Mega.callbackHandler = function (query, callback) {
        //handle the recieved credentials, 'query' contains the GET params. (like for OAuth, authentication code is 'query.code')
        //after successfull authenticaltion, return creds to 'callback' to be stored as session variable
        //if authentication fails, call the callback as: callback(0)
        // when user requests a file upload, credentials from session will be used to initialize this class (the constructor will be called)
        var storage = mega({ email: query.username, password: query.password, keepalive: false }, function (err) {
            if (err)
                callback(0);
        });
        storage.on('ready', function () {
            callback({ email: query.username, password: query.password });
        });
    };
    Mega.prototype.uploadFile = function (readStream, totalSize, mime, filename) {
        //handle the upload procedure
        //it should emit => progress        : {name,uploaded,size}
        //                  fileUploaded    : {size, name , error} 
        var self = this;
        var storage = mega({ email: this.creds.email, password: this.creds.password, keepalive: false });
        var up = storage.upload({
            name: filename,
            size: totalSize
        }, function (err, file) {
            if (err) {
                debug(err);
                self.emit("fileUploaded", {
                    size: totalSize,
                    name: filename,
                    error: err
                });
                return;
            }
            debug('\nUploaded', file.name, file.size + 'B');
        });
        readStream.pipe(up);
        up.on('progress', function (stats) {
            self.emit("progress", {
                name: filename,
                uploaded: stats.bytesLoaded,
                size: totalSize
            });
        });
        up.on('complete', function () {
            self.emit("fileUploaded", {
                size: totalSize,
                name: filename,
                error: false
            });
        });
    };
    return Mega;
}(events_1.EventEmitter));
exports.Mega = Mega;
//# sourceMappingURL=Mega.js.map