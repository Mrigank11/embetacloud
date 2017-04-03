const mega = require("mega");
const debug = require("debug")("eMCloud::Mega");

import { EventEmitter } from 'events';

export class Mega extends EventEmitter {
    creds;
    constructor(credentials) {
        super();
        this.creds = credentials;
        //store credentials, they can be username/password or OAuth Tokens etc.
    }
    static getURL() {
        //return the url on which the user will be redirected for credentials, can be OAuth Consent Page or a page on server itself.
        return "/login/mega";
    }
    static callbackHandler(query, callback) {
        //handle the recieved credentials, 'query' contains the GET params. (like for OAuth, authentication code is 'query.code')
        //after successfull authenticaltion, return creds to 'callback' to be stored as session variable
        //if authentication fails, call the callback as: callback(0)
        // when user requests a file upload, credentials from session will be used to initialize this class (the constructor will be called)
        var storage = mega({ email: query.username, password: query.password, keepalive: false }, (err) => {
            if (err) callback(0);
        });
        storage.on('ready', () => {
            callback({ email: query.username, password: query.password });
        })
    }
    public uploadFile(readStream, totalSize, mime, filename) {
        //handle the upload procedure
        //it should emit => progress        : {name,uploaded,size}
        //                  fileUploaded    : {size, name , error} 
        var self = this;
        var storage = mega({ email: this.creds.email, password: this.creds.password, keepalive: false })
        var up = storage.upload({
            name: filename,
            size: totalSize
        },
            function (err, file) {
                if (err) {
                    debug(err);
                    self.emit("fileUploaded", {
                        size: totalSize,
                        name: filename,
                        error: err
                    })
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
        })
        up.on('complete', function () {
            self.emit("fileUploaded", {
                size: totalSize,
                name: filename,
                error: false
            })
        })
    }
    //public uploadDir(localFolderPath) {          //not necessary
    //upload a local directory
    //should emit    => addSize    : size      size in bytes to be added to total upload size
    //may emit       => mkdir      : name      name of cloud directory created
    //}
}