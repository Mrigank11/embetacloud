"use strict";
//Requires
var Unblocker = require('unblocker');
var shortid = require('shortid');
var session = require('express-session');
var PirateBay = require('thepiratebay');
var prettyBytes = require('pretty-bytes');
var debug = require('debug')("eMCloud::Server");
var socketIO = require("socket.io");
var FILE = require("fs-extra");
var mime = require('mime');
var http = require('http');
var path = require('path');
var GDrive_1 = require('./GDrive/GDrive');
var Torrent_1 = require('./Torrent/Torrent');
var express = require('express');
//Constants
var PORT = Number(process.env.PORT || 3000);
var SERVER_DIRS = ['css', 'js', 'libs', 'parts'];
var FILES_PATH = path.join(__dirname, '../files');
var SPEED_TICK_TIME = 500; //ms
//Init
var oauth2ClientArray = {};
var capture = false;
var app = express();
var server = http.createServer(app);
var io = socketIO(server);
var visitedPages = {};
var torrents = {};
var torrentObjs = {};
var CLOUD = new GDrive_1.GDrive();
var incognitoSessions = [];
function percentage(n) {
    var p = (Math.round(n * 1000) / 10);
    return (p > 100) ? 100 : p;
}
//TODO send pageVisited to its respective user using sessionID
function middleware(data) {
    var sessionID = data.clientRequest.sessionID;
    var newFileName = null;
    if (!data.contentType.startsWith('text/') && !data.contentType.startsWith('image/')) {
        debug("Starting download of %s", data.url);
        var uniqid = shortid.generate();
        var totalLength = data.headers['content-length'];
        var downloadedLength = 0;
        newFileName = uniqid + '.' + mime.extension(data.contentType);
        var completeFilePath = path.join(FILES_PATH, newFileName);
        //create /files if it doesn't exist 
        if (!FILE.existsSync(FILES_PATH)) {
            FILE.mkdirSync(FILES_PATH);
        }
        FILE.closeSync(FILE.openSync(completeFilePath, 'w')); //create an empty file
        var stream = FILE.createWriteStream(completeFilePath);
        data.stream.pipe(stream);
        data.stream.on('data', function (chunk) {
            downloadedLength += chunk.length;
            var progress = percentage((downloadedLength / totalLength));
            if (visitedPages[uniqid]) {
                if (visitedPages[uniqid].cleared) {
                    stream.close();
                    FILE.unlink(completeFilePath); //delete incomplete file
                    delete visitedPages[uniqid];
                    io.emit('deleteKey', {
                        name: 'visitedPages',
                        key: uniqid
                    });
                }
                else {
                    visitedPages[uniqid].progress = progress;
                    visitedPages[uniqid].downloaded = prettyBytes(downloadedLength);
                    sendVisitedPagesUpdate(io, uniqid);
                }
            }
        });
        var prevLen = 0;
        var speed;
        var interval = setInterval(function () {
            if ((visitedPages[uniqid] && visitedPages[uniqid].cleared) || !visitedPages[uniqid]) {
                clearInterval(interval);
            }
            if (prevLen !== downloadedLength && visitedPages[uniqid]) {
                speed = prettyBytes((downloadedLength - prevLen) / SPEED_TICK_TIME * 1000) + '/s';
                visitedPages[uniqid].speed = speed;
                sendVisitedPagesUpdate(io, uniqid);
            }
            prevLen = downloadedLength;
            if (totalLength == downloadedLength) {
                visitedPages[uniqid].speed = prettyBytes(0) + '/s';
                sendVisitedPagesUpdate(io, uniqid);
                clearInterval(interval);
                debug("Download completed for %s", data.url);
            }
        }, SPEED_TICK_TIME);
        var obj = {
            url: data.url,
            id: uniqid,
            mime: data.contentType,
            size: prettyBytes(data.headers['content-length'] * 1),
            path: '/files/' + newFileName,
            pinned: false,
            length: data.headers['content-length'] * 1
        };
        visitedPages[uniqid] = obj;
        sendVisitedPagesUpdate(io, uniqid);
    }
}
function sendVisitedPagesUpdate(socket, id) {
    socket.emit('setKey', {
        name: 'visitedPages',
        key: id,
        value: visitedPages[id]
    });
}
function sendTorrentsUpdate(socket, id) {
    socket.emit('setKey', {
        name: 'torrents',
        key: id,
        value: torrents[id],
        ignore: ["dirStructure", "showFiles"]
    });
}
var sessionMiddleware = session({
    secret: "XYeMBetaCloud",
    resave: false,
    saveUninitialized: true
});
//set up express
app.use(sessionMiddleware);
app.use(new Unblocker({ prefix: '/proxy/', responseMiddleware: [middleware] }));
SERVER_DIRS.forEach(function (dir) {
    app.use('/' + dir, express.static(path.join(__dirname, '../static', dir)));
});
app.use('/files', express.static(FILES_PATH));
app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, '../static', 'index.html'));
});
app.get('/oauthCallback', function (req, res) {
    var sessionID = req['sessionID'];
    var oauth2Client = oauth2ClientArray[sessionID];
    if (!oauth2Client) {
        res.send('Invalid Attempt[E01]');
        return false;
    }
    var code = req.query.code;
    if (code) {
        oauth2Client.getToken(code, function (err, tokens) {
            if (!err) {
                oauth2Client.setCredentials(tokens);
                res.redirect('/');
            }
            else {
                console.log("Error: " + err);
                res.end('Error Occured');
            }
        });
    }
    else {
        res.send('Invalid Attempt[E03]');
    }
});
// set up socket.io to use sessions
io.use(function (socket, next) {
    sessionMiddleware(socket.conn.request, socket.conn.request.res, next);
});
//handle socket.io connections
io.on('connection', function (client) {
    var sessionID = client.conn.request.sessionID;
    if (!oauth2ClientArray[sessionID]) {
        oauth2ClientArray[sessionID] = CLOUD.newOauthClient();
    }
    var consentPageUrl = CLOUD.getConsentPageURL(oauth2ClientArray[sessionID]);
    client.emit('setObj', {
        name: 'status',
        value: {
            consentPageUrl: consentPageUrl,
            logged: (Object.keys(oauth2ClientArray[sessionID].credentials).length > 0)
        }
    });
    client.emit('setObj', {
        name: 'visitedPages',
        value: visitedPages
    });
    client.emit('setObj', {
        name: 'torrents',
        value: torrents
    });
    client.on('clearVisitedPages', function () {
        Object.keys(visitedPages).forEach(function (id) {
            if (!visitedPages[id].pinned) {
                if (visitedPages[id].progress == 100) {
                    //  download completed but user requested to clear
                    // delete downloaded file
                    FILE.unlink(path.join(FILES_PATH, '../', visitedPages[id].path));
                    delete visitedPages[id];
                }
                else {
                    // download is in progress
                    // partial file will be deleted by middleware function
                    visitedPages[id].cleared = true;
                }
            }
        });
    });
    client.on('clearTorrents', function () {
        Object.keys(torrents).forEach(function (id) {
            if (!torrents[id].pinned) {
                io.emit("deleteKey", {
                    name: 'torrents',
                    key: id
                });
                if (torrents[id].progress == 100) {
                    //  download completed but user requested to clear
                    // delete downloaded file
                    FILE.remove(path.join(FILES_PATH, id));
                    delete torrents[id];
                    delete torrentObjs[id];
                }
                else {
                    delete torrents[id];
                    torrentObjs[id].destroy();
                    delete torrentObjs[id];
                    FILE.remove(path.join(FILES_PATH, id));
                }
            }
        });
    });
    client.on('saveToDrive', function (data) {
        var obj = data.data;
        var stream = FILE.createReadStream(path.join(FILES_PATH, '../', obj.path));
        var req = CLOUD.uploadFile(stream, obj.length, obj.mime, data.name, oauth2ClientArray[sessionID], false, function (err, resp) {
            if (err) {
                console.log(err);
                var msg = "Error: " + err;
                visitedPages[obj.id].msg = msg;
                sendVisitedPagesUpdate(io, obj.id);
            }
            else {
                var msg = "Uploaded " + resp.name + " to Drive";
                visitedPages[obj.id].msg = msg;
                sendVisitedPagesUpdate(io, obj.id);
            }
        }, obj.id);
        CLOUD.on('progress', function (data) {
            if (data.type == 'file' && data.id == obj.id) {
                visitedPages[obj.id].msg = "Uploaded " + percentage(data.uploaded / obj.length) + "%";
                sendVisitedPagesUpdate(io, obj.id);
            }
        });
    });
    client.on('pin', function (data) {
        if (data.isTorrent) {
            torrents[data.page.id].pinned = true;
            return false;
        }
        visitedPages[data.page.id].pinned = true;
    });
    client.on('unpin', function (data) {
        if (data.isTorrent) {
            torrents[data.page.id].pinned = false;
            return false;
        }
        visitedPages[data.page.id].pinned = false;
    });
    client.on('pirateSearch', function (data) {
        var query = data.query;
        var page = data.page;
        PirateBay.search(query).then(function (results) {
            client.emit('setObj', {
                name: 'search',
                value: {
                    results: results,
                    loading: false
                }
            });
        });
    });
    client.on('addTorrent', function (data) {
        var uniqid = shortid();
        torrentObjs[uniqid] = new Torrent_1.Torrent(data.magnet, FILES_PATH, uniqid);
        torrentObjs[uniqid].on("downloaded", function (path) {
            //CLOUD.uploadDir(path, oauth2ClientArray[sessionID]);
        });
        torrentObjs[uniqid].on("info", function (info) {
            torrents[uniqid] = {
                id: uniqid,
                name: info.name,
                infoHash: info.infoHash,
                size: prettyBytes(info.length),
                isTorrent: true,
                length: info.length,
                showFiles: false,
                msg: 'Connecting to peers'
            };
            sendTorrentsUpdate(client, uniqid);
            client.emit("setObj", {
                name: 'magnetLoading',
                value: false
            });
        });
        torrentObjs[uniqid].on("progress", function (data) {
            if ((torrents[uniqid].progress == 100) || !torrents[uniqid]) {
                return false;
            }
            var speed = prettyBytes(data.speed) + '/s';
            var downloaded = prettyBytes(data.downloadedLength);
            var progress = percentage((data.downloadedLength / torrents[uniqid].length));
            var peers = data.peers;
            torrents[uniqid].speed = (progress == 100) ? prettyBytes(0) + '/s' : speed;
            torrents[uniqid].downloaded = downloaded;
            torrents[uniqid].progress = progress;
            torrents[uniqid].msg = (progress == 100) ? 'Download completed' : 'Downloading files, peers: ' + peers;
            sendTorrentsUpdate(io, uniqid);
        });
    });
    client.on('getDirStructure', function (data) {
        var id = data.id;
        var dirStructure = torrentObjs[id].getDirObj();
        torrents[id].gettingDirStructure = false;
        torrents[id].dirStructure = dirStructure;
        torrents[id].msg = 'Got directory structure';
        sendTorrentsUpdate(client, id);
    });
    client.on("uploadDirToDrive", function (data) {
        var id = data.id;
        var dirSize = 0;
        CLOUD.uploadDir(path.join(FILES_PATH, id), oauth2ClientArray[sessionID], false, id);
        var uploaded = 0;
        CLOUD.on("addSize", function (data) {
            if (data.id == id) {
                dirSize = dirSize + data.size;
            }
        });
        CLOUD.on("fileDownloaded", function (data) {
            if (data.id == id) {
                uploaded = uploaded + data.size;
                var name = data.name;
                torrents[id].msg = "Uploaded " + name + " successfully | Total: " + percentage(uploaded / dirSize) + "%";
                torrents[id].cloudUploadProgress = percentage(uploaded / dirSize);
                sendTorrentsUpdate(io, id);
            }
        });
        CLOUD.on('progress', function (data) {
            if (data.id == id) {
                switch (data.type) {
                    case 'mkdir':
                        torrents[id].msg = 'Creating cloud directory: ' + data.name;
                        sendTorrentsUpdate(io, id);
                        break;
                    case 'file':
                        torrents[id].msg = 'Uploading ' + data.name + ' : ' + percentage(data.uploaded / data.size) + "% | Total: " + percentage(uploaded / dirSize) + "%";
                        sendTorrentsUpdate(io, id);
                        break;
                }
            }
        });
    });
    client.on("toggleIncognito", function () {
        if (incognitoSessions.indexOf(sessionID) > -1) {
            incognitoSessions.splice(incognitoSessions.indexOf(sessionID));
        }
        else {
            incognitoSessions.push(sessionID);
        }
    });
});
server.listen(PORT);
debug('Server Listening on port:', PORT);
//# sourceMappingURL=server.js.map