const google = require('googleapis');
const debug = require('debug')('eMCloud::GDrive');
import * as FILE from 'fs';
import * as mime from 'mime';
import * as path from 'path';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
//const REDIRECT_URL = 'https://embetacloud.herokuapp.com/oauthCallback';
const REDIRECT_URL = 'http://127.0.0.1:3000/oauthCallback';
const SCOPES = [
    'https://www.googleapis.com/auth/plus.me',
    'https://www.googleapis.com/auth/drive'
];

const OAuth2 = google.auth.OAuth2;


export class GDrive {
    newOauthClient() {
        return new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
    }
    uploadFile(stream, mime, fileName, oauth2Client, parentId?, callback?) {
        debug('Uploading file %s with parentId: %s', fileName, parentId);
        var drive = google.drive({ version: 'v3', auth: oauth2Client });
        var fileMetadata = {
            name: fileName,
            mimeType: mime
        }
        if (parentId) {
            fileMetadata['parents'] = [parentId];
        }
        return drive.files.create({
            resource: fileMetadata,
            media: {
                mimeType: mime,
                body: stream
            }
        }, () => {
            debug('Uploaded %s to Drive Successfully', name);
            callback();
        });
    }
    getConsentPageURL(oauth2Client) {
        var url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES
        });
        return url;
    }
    makeDir(name, oauth2Client, callback, parentId?) {
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
            } else {
                callback(file.id);
            }
        });

    }

    uploadDir(folderPath, oauth2Client, parentId?) {
        FILE.readdir(folderPath, (err, list) => {
            if (!err) {
                list.forEach((item) => {
                    FILE.lstat(path.join(folderPath, item), (e, stat) => {
                        if (!err) {
                            if (stat.isDirectory()) {
                                this.makeDir(item, oauth2Client, (newParentId) => {
                                    this.uploadDir(path.join(folderPath, item), oauth2Client, newParentId);
                                }, parentId);
                            } else {
                                var fullPath = path.join(folderPath, item);
                                var stream = FILE.createReadStream(fullPath);
                                debug('Sending file to drive : %s', item);
                                this.uploadFile(stream, mime.lookup(fullPath), item, oauth2Client, parentId);
                            }
                        } else {
                            debug(err);
                        }
                    });
                });
            } else {
                debug(err);
            }
        });
    }
}