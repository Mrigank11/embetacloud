"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var google = require('googleapis');
var debug = require('debug')('eMCloud::GDrive');
var FILE = require("fs");
var mime = require("mime");
var path = require("path");
var events_1 = require("events");
var CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
var CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
var REDIRECT_URL = process.env.GOOGLE_REDIRECT_URL;
var SCOPES = [
    'https://www.googleapis.com/auth/plus.me',
    'https://www.googleapis.com/auth/drive'
];
var SPEED_TICK_TIME = 500;
var OAuth2 = google.auth.OAuth2;
var GDrive = (function (_super) {
    __extends(GDrive, _super);
    function GDrive() {
        var _this = _super.apply(this, arguments) || this;
        _this.stack = [];
        _this.stackProcessing = false;
        return _this;
    }
    GDrive.newOauthClient = function () {
        return new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
    };
    /**
     *Upload a file to GDrive
     * Emits:
     *      'progress'      :name,uploaded,size
     *      'fileUploaded':size,name,error
     */
    GDrive.prototype.uploadFile = function (stream, totalSize, mime, fileName, oauth2Client, parentId, callback) {
        var _this = this;
        //Init upload
        this.emit('progress', {
            type: 'file',
            name: fileName,
            uploaded: 0,
            size: totalSize
        });
        debug('Uploading file %s with parentId: %s', fileName, parentId);
        //start upload
        var drive = google.drive({ version: 'v3', auth: oauth2Client });
        var fileMetadata = {
            name: fileName,
            mimeType: mime
        };
        if (parentId) {
            fileMetadata['parents'] = [parentId];
        }
        var req = drive.files.create({
            resource: fileMetadata,
            media: {
                mimeType: mime,
                body: stream
            }
        }, function (err, resp) {
            debug('Uploaded %s to Drive Successfully', fileName);
            _this.emit("fileUploaded", {
                size: totalSize,
                name: fileName,
                error: err
            });
            if (callback)
                callback(err, resp);
        });
        var interval = setInterval(function () {
            _this.emit("progress", {
                type: 'file',
                name: fileName,
                uploaded: req.req.connection.bytesWritten,
                size: totalSize
            });
            if (req.req.connection.bytesWritten >= totalSize) {
                clearInterval(interval);
            }
        }, SPEED_TICK_TIME);
        return req;
    };
    GDrive.getConsentPageURL = function (oauth2Client) {
        var url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES
        });
        return url;
    };
    /**
     *Create GDrive directory
     * Emits:
     *      'mkdir':name
     */
    GDrive.prototype.makeDir = function (name, oauth2Client, callback, parentId) {
        this.emit('mkdir', {
            name: name
        });
        debug('Creating Directory %s with parentId: %s', name, parentId);
        var drive = google.drive({ version: 'v3', auth: oauth2Client });
        var fileMetadata = {
            name: name,
            mimeType: 'application/vnd.google-apps.folder'
        };
        if (parentId) {
            fileMetadata['parents'] = [parentId];
        }
        drive.files.create({
            resource: fileMetadata,
            fields: 'id'
        }, function (err, file) {
            if (err) {
                // Handle error
                debug(err);
            }
            else {
                callback(file.id);
            }
        });
    };
    GDrive.prototype.uploadStack = function () {
        var _this = this;
        if (this.stack.length > 0) {
            this.stackProcessing = true;
            var params = this.stack[0];
            this.uploadFile(params[0], params[1], params[2], params[3], params[4], params[5], function (err, resp) {
                if (err) {
                    debug("Error processing stack: " + err);
                }
                else {
                    _this.stack.splice(0, 1);
                    _this.uploadStack();
                }
            });
        }
        else {
            this.stackProcessing = false;
        }
    };
    /**
     *Upload directory
     * Emits:
     *      'addSize':size
     */
    GDrive.prototype.uploadDir = function (folderPath, oauth2Client, parentId) {
        var _this = this;
        FILE.readdir(folderPath, function (err, list) {
            if (!err) {
                list.forEach(function (item) {
                    FILE.lstat(path.join(folderPath, item), function (e, stat) {
                        _this.emit("addSize", {
                            size: stat.size
                        });
                        if (!err) {
                            if (stat.isDirectory()) {
                                _this.makeDir(item, oauth2Client, function (newParentId) {
                                    _this.uploadDir(path.join(folderPath, item), oauth2Client, newParentId);
                                }, parentId);
                            }
                            else {
                                var fullPath = path.join(folderPath, item);
                                var stream = FILE.createReadStream(fullPath);
                                //this.uploadFile(stream, stat.size, mime.lookup(fullPath), item, oauth2Client, parentId);
                                _this.stack.push([stream, stat.size, mime.lookup(fullPath), item, oauth2Client, parentId]);
                                if (!_this.stackProcessing) {
                                    //stack not running
                                    _this.uploadStack();
                                }
                            }
                        }
                        else {
                            debug(err);
                        }
                    });
                });
            }
            else {
                debug(err);
            }
        });
    };
    return GDrive;
}(events_1.EventEmitter));
exports.GDrive = GDrive;
//# sourceMappingURL=GDrive.js.map