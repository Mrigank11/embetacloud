"use strict";
//Requires
var url = require('url');
var Unblocker = require('unblocker');
var shortid = require('shortid');
var session = require('express-session');
var PirateBay = require('thepiratebay');
var prettyBytes = require('pretty-bytes');
var debug = require('debug')("Cloud::Server");
var express = require("express");
var socketIO = require("socket.io");
var FILE = require('fs');
var mime = require('mime');
var http = require('http');
var path = require('path');
var GDrive_1 = require('./GDrive/GDrive');
var Torrent_1 = require('./Torrent/Torrent');
//Constants
var PORT = Number(process.env.PORT || 3000);
var SERVER_DIRS = ['css', 'files', 'js', 'libs', 'parts'];
var FILES_PATH = path.join(__dirname, '../files');
var SPEED_TICK_TIME = 500; //ms
//Init
var oauth2ClientArray = {};
var capture = false;
var app = express();
var server = http.createServer(app);
var io = socketIO(server);
var visitedPages = {};
var CLOUD = new GDrive_1.GDrive();
//TODO send pageVisited to its respective user using sessionID
function middleware(data) {
    var uniqid = shortid.generate();
    var sessionID = data.clientRequest.sessionID;
    var newFileName = null;
    if (!data.contentType.startsWith('text/') && !data.contentType.startsWith('image/')) {
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
            var progress = Math.round(((downloadedLength / totalLength) * 1000)) / 10;
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
            }
        }, SPEED_TICK_TIME);
        var obj = {
            url: data.url,
            id: uniqid,
            mime: data.contentType,
            size: prettyBytes(data.headers['content-length'] / 2 * 2),
            path: '/files/' + newFileName,
            pinned: false
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
var sessionMiddleware = session({
    secret: "XYeMBetaCloud",
    resave: false,
    saveUninitialized: true
});
app.use(sessionMiddleware);
app.use(new Unblocker({ prefix: '/proxy/', responseMiddleware: [middleware] }));
SERVER_DIRS.forEach(function (dir) {
    app.use('/' + dir, express.static(path.join(__dirname, '../static', dir)));
});
app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, '../static', 'index.html'));
});
app.get('/oauthCallback', function (req, res) {
    var sessionID = req.sessionID;
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
io.use(function (socket, next) {
    sessionMiddleware(socket.conn.request, socket.conn.request.res, next);
});
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
    client.on('saveToDrive', function (data) {
        var obj = data.data;
        var stream = FILE.createReadStream(__dirname + obj.path);
        var req = CLOUD.uploadFile(stream, obj.mime, data.name, oauth2ClientArray[sessionID], function (err, resp) {
            if (err) {
                console.log(err);
                var msg = "Error: " + err;
                visitedPages[obj.id].msg = msg;
                sendVisitedPagesUpdate(client, obj.id);
            }
            else {
                var msg = "Uploaded " + resp.name + " to Drive";
                visitedPages[obj.id].msg = msg;
            }
        });
        var q = setInterval(function () {
            var written = req.req.connection.bytesWritten;
            var percent = Math.round((written / obj.size) * 1000) / 10;
            visitedPages[obj.id].msg = "Uploaded " + percent + "%";
            sendVisitedPagesUpdate(client, obj.id);
            if (written >= obj.size) {
                clearInterval(q);
            }
        }, 250);
    });
    client.on('pin', function (data) {
        visitedPages[data.page.id].pinned = true;
    });
    client.on('unpin', function (data) {
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
        var torrentEngine = new Torrent_1.Torrent(data.magnet, FILES_PATH);
        torrentEngine.on("downloaded", function (path) {
            CLOUD.uploadDir(path, oauth2ClientArray[sessionID]);
        });
    });
});
server.listen(PORT);
debug('Server Listening on port:', PORT);
//# sourceMappingURL=server.js.map