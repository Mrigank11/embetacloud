"use strict";
var google = require('googleapis');
var debug = require('debug')('Cloud::GDrive');
var FILE = require('fs');
var mime = require('mime');
var path = require('path');
var CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
var CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
//const REDIRECT_URL = 'https://embetacloud.herokuapp.com/oauthCallback';
var REDIRECT_URL = 'http://127.0.0.1:3000/oauthCallback';
var SCOPES = [
    'https://www.googleapis.com/auth/plus.me',
    'https://www.googleapis.com/auth/drive'
];
var OAuth2 = google.auth.OAuth2;
var GDrive = (function () {
    function GDrive() {
    }
    GDrive.prototype.newOauthClient = function () {
        return new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
    };
    GDrive.prototype.uploadFile = function (stream, mime, fileName, oauth2Client, parentId, callback) {
        debug('Uploading file %s with parentId: %s', fileName, parentId);
        var drive = google.drive({ version: 'v3', auth: oauth2Client });
        var fileMetadata = {
            name: fileName,
            mimeType: mime
        };
        if (parentId) {
            fileMetadata['parents'] = [parentId];
        }
        return drive.files.create({
            resource: fileMetadata,
            media: {
                mimeType: mime,
                body: stream
            }
        }, function () {
            debug('Uploaded %s to Drive Successfully', name);
            callback();
        });
    };
    GDrive.prototype.getConsentPageURL = function (oauth2Client) {
        var url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES
        });
        return url;
    };
    GDrive.prototype.makeDir = function (name, oauth2Client, callback, parentId) {
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
    GDrive.prototype.uploadDir = function (folderPath, oauth2Client, parentId) {
        var _this = this;
        FILE.readdir(folderPath, function (err, list) {
            if (!err) {
                list.forEach(function (item) {
                    FILE.lstat(path.join(folderPath, item), function (e, stat) {
                        if (!err) {
                            if (stat.isDirectory()) {
                                _this.makeDir(item, oauth2Client, function (newParentId) {
                                    _this.uploadDir(path.join(folderPath, item), oauth2Client, newParentId);
                                }, parentId);
                            }
                            else {
                                var fullPath = path.join(folderPath, item);
                                var stream = FILE.createReadStream(fullPath);
                                debug('Sending file to drive : %s', item);
                                _this.uploadFile(stream, mime.lookup(fullPath), item, oauth2Client, parentId);
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
}());
exports.GDrive = GDrive;
//# sourceMappingURL=GDrive.js.map