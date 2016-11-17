"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var google = require('googleapis');
var debug = require('debug')('eMCloud::GDrive');
var FILE = require('fs');
var mime = require('mime');
var path = require('path');
var events_1 = require('events');
var CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
var CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
var REDIRECT_URL = 'https://embetacloud.herokuapp.com/oauthCallback';
//const REDIRECT_URL = 'http://127.0.0.1:3000/oauthCallback';
var SCOPES = [
    'https://www.googleapis.com/auth/plus.me',
    'https://www.googleapis.com/auth/drive'
];
var SPEED_TICK_TIME = 500;
var OAuth2 = google.auth.OAuth2;
var GDrive = (function (_super) {
    __extends(GDrive, _super);
    function GDrive() {
        _super.apply(this, arguments);
    }
    GDrive.prototype.newOauthClient = function () {
        return new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
    };
    GDrive.prototype.uploadFile = function (stream, totalSize, mime, fileName, oauth2Client, parentId, callback, id) {
        var _this = this;
        this.emit('progress', {
            id: id,
            type: 'file',
            name: fileName,
            uploaded: 0,
            size: totalSize
        });
        debug('Uploading file %s with parentId: %s', fileName, parentId);
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
            _this.emit("fileDownloaded", {
                id: id,
                size: totalSize,
                name: fileName
            });
            if (callback) {
                callback(err, resp);
            }
        });
        var interval = setInterval(function () {
            _this.emit("progress", {
                id: id,
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
    GDrive.prototype.getConsentPageURL = function (oauth2Client) {
        var url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES
        });
        return url;
    };
    GDrive.prototype.makeDir = function (name, oauth2Client, callback, parentId, id) {
        this.emit('progress', {
            id: id,
            type: 'mkdir',
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
                console.log(err);
            }
            else {
                callback(file.id);
            }
        });
    };
    GDrive.prototype.uploadDir = function (folderPath, oauth2Client, parentId, id) {
        var _this = this;
        FILE.readdir(folderPath, function (err, list) {
            if (!err) {
                list.forEach(function (item) {
                    FILE.lstat(path.join(folderPath, item), function (e, stat) {
                        _this.emit("addSize", {
                            id: id,
                            size: stat.size
                        });
                        if (!err) {
                            if (stat.isDirectory()) {
                                _this.makeDir(item, oauth2Client, function (newParentId) {
                                    _this.uploadDir(path.join(folderPath, item), oauth2Client, newParentId, id);
                                }, parentId, id);
                            }
                            else {
                                var fullPath = path.join(folderPath, item);
                                var stream = FILE.createReadStream(fullPath);
                                _this.uploadFile(stream, stat.size, mime.lookup(fullPath), item, oauth2Client, parentId, false, id);
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