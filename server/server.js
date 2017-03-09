"use strict";
//Requires
var unblocker = require('./unblocker.js');
var shortid = require('shortid');
var session = require('express-session');
var PirateBay = require('thepiratebay');
var prettyBytes = require('pretty-bytes');
var debug = require('debug')("eMCloud::Server");
var socketIO = require("socket.io");
var FILE = require("fs-extra");
var archiver = require("archiver");
var magnet = require('magnet-uri');
var mime = require("mime");
var http = require("http");
var path = require("path");
var GDrive_1 = require("./GDrive/GDrive");
var Torrent_1 = require("./Torrent/Torrent");
var Filter_1 = require("./Filter/Filter");
var express = require("express");
//Constants
var PORT = Number(process.env.PORT || 3000);
var FILES_PATH = path.join(__dirname, '../files');
var SPEED_TICK_TIME = 750; //ms
//Init
var oauth2ClientArray = {};
var capture = false;
var app = express();
var server = http.createServer(app);
var io = socketIO(server);
var visitedPages = {};
var torrents = {};
var torrentObjs = {};
var CLOUD = GDrive_1.GDrive;
var filter = new Filter_1.Filter();
var incognitoSessions = [];
function percentage(n) {
    var p = (Math.round(n * 1000) / 10);
    return (p > 100) ? 100 : p;
}
function saveToDriveHandler(sessionID, data) {
    var obj = data.data;
    if (obj.progress !== 100) {
        var i = visitedPages[obj.id].uploadTo.indexOf(sessionID);
        if (i > -1) {
            //already in Array
            visitedPages[obj.id].uploadTo.splice(i, 1);
            visitedPages[obj.id].msg = "Auto-Upload Disabled";
        }
        else {
            //new subscriber
            visitedPages[obj.id].uploadTo.push(sessionID);
            visitedPages[obj.id].msg = "Auto-Upload Enabled";
        }
        visitedPages[obj.id].uploadFileName = data.name;
        sendVisitedPagesUpdate(io, obj.id);
        return;
    }
    var stream = FILE.createReadStream(path.join(FILES_PATH, '../', obj.path));
    var cloudInstance = new CLOUD();
    var req = cloudInstance.uploadFile(stream, obj.length, obj.mime, data.name, oauth2ClientArray[sessionID], false);
    cloudInstance.on('progress', function (data) {
        if (visitedPages[obj.id]) {
            visitedPages[obj.id].msg = "Uploaded " + percentage(data.uploaded / obj.length) + "%";
            sendVisitedPagesUpdate(io, obj.id);
        }
    });
    cloudInstance.on("fileUploaded", function (data) {
        if (!visitedPages[obj.id]) {
            return;
        }
        if (data.error) {
            console.log(data.error);
            var msg = "Error: " + data.error;
            visitedPages[obj.id].msg = msg;
            sendVisitedPagesUpdate(io, obj.id);
        }
        else {
            var msg = "Uploaded " + data.name + " to Drive";
            visitedPages[obj.id].msg = msg;
            sendVisitedPagesUpdate(io, obj.id);
        }
    });
}
/**
 *@params:  sessionID
            data        {data:id}
 */
function uploadDirToDrive(sessionID, data) {
    var id = data.id;
    if (torrents[id].progress !== 100) {
        var i = torrents[id].uploadTo.indexOf(sessionID);
        if (i > -1) {
            //already in Array
            torrents[id].uploadTo.splice(i, 1);
            torrents[id].msg = "Auto-Upload Disabled";
        }
        else {
            //new subscriber
            torrents[id].uploadTo.push(sessionID);
            torrents[id].msg = "Auto-Upload Enabled";
        }
        sendTorrentsUpdate(io, id);
        return;
    }
    var dirSize = 0;
    var currentFileProgress = 0;
    var cloudInstance = new CLOUD();
    cloudInstance.uploadDir(path.join(FILES_PATH, id), oauth2ClientArray[sessionID], false);
    var uploaded = 0;
    cloudInstance.on("addSize", function (data) {
        dirSize = dirSize + data.size;
    });
    cloudInstance.on("fileUploaded", function (data) {
        if (!torrents[id]) {
            return;
        }
        uploaded += data.size;
        var name = data.name;
        torrents[id].msg = "Uploaded " + name + " successfully | Total: " + percentage(uploaded / dirSize) + "%";
        torrents[id].cloudUploadProgress = percentage(uploaded / dirSize);
        sendTorrentsUpdate(io, id);
    });
    cloudInstance.on('progress', function (data) {
        if (!torrents[id]) {
            return;
        }
        currentFileProgress = data.uploaded;
        var totalProgress = percentage((uploaded + currentFileProgress) / dirSize);
        torrents[id].msg = 'Uploading ' + data.name + ' : ' + percentage(data.uploaded / data.size) + "% | Total: " + totalProgress + "%";
        torrents[id].cloudUploadProgress = totalProgress;
        sendTorrentsUpdate(io, id);
    });
    cloudInstance.on("mkdir", function (data) {
        if (!torrents[id]) {
            return;
        }
        torrents[id].msg = 'Creating cloud directory: ' + data.name;
        sendTorrentsUpdate(io, id);
    });
}
function clearVisitedPage(id) {
    if (!visitedPages[id].pinned) {
        io.emit("deleteKey", {
            name: 'visitedPages',
            key: id
        });
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
}
function clearTorrent(id) {
    if (!torrents[id].pinned) {
        io.emit("deleteKey", {
            name: 'torrents',
            key: id
        });
        if (torrents[id].progress == 100) {
            //  download completed but user requested to clear
            // delete downloaded file
            FILE.remove(path.join(FILES_PATH, id));
            FILE.remove(path.join(FILES_PATH, id + ".zip"));
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
}
//TODO send pageVisited to its respective user using sessionID
function middleware(data) {
    var sessionID = data.clientRequest.sessionID;
    var newFileName = null;
    if (filter.passed(data) && data.headers['content-length']) {
        var duplicates = Object.keys(visitedPages).filter(function (key) {
            return visitedPages[key].url == data.url;
        });
        if (duplicates.length > 0) {
            return false;
        }
        debug("DL:%s from %s", data.contentType, data.url);
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
                    var prevProgress = visitedPages[uniqid].progress;
                    if ((progress - prevProgress) > 0.1 || progress == 100) {
                        visitedPages[uniqid].progress = progress;
                        visitedPages[uniqid].downloaded = prettyBytes(downloadedLength);
                        sendVisitedPagesUpdate(io, uniqid);
                    }
                }
            }
        });
        var prevLen = 0;
        var speed;
        var interval = setInterval(function () {
            if ((visitedPages[uniqid] && visitedPages[uniqid].cleared) || !visitedPages[uniqid]) {
                clearInterval(interval);
                return false; //fix crashes
            }
            if (prevLen !== downloadedLength) {
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
                var array = visitedPages[uniqid].uploadTo;
                array.forEach(function (sessionID) {
                    saveToDriveHandler(sessionID, {
                        data: visitedPages[uniqid],
                        name: visitedPages[uniqid].uploadFileName
                    });
                });
            }
        }, SPEED_TICK_TIME);
        var obj = {
            url: data.url,
            id: uniqid,
            mime: data.contentType,
            size: prettyBytes(data.headers['content-length'] * 1),
            path: '/files/' + newFileName,
            pinned: false,
            progress: 0,
            length: data.headers['content-length'] * 1,
            uploadTo: [] //holds list of session Ids to upload on dl complete
        };
        visitedPages[uniqid] = obj;
        sendVisitedPagesUpdate(io, uniqid);
    }
}
function sendVisitedPagesUpdate(socket, id, imp) {
    var ignore = ["pinned"];
    if (imp)
        imp.forEach(function (a) {
            if (ignore.indexOf(a) > -1)
                ignore.splice(ignore.indexOf(a));
        });
    socket.emit('setKey', {
        name: 'visitedPages',
        key: id,
        value: visitedPages[id],
        ignore: ignore
    });
}
function sendTorrentsUpdate(socket, id, imp) {
    var ignore = ["dirStructure", "showFiles", "pinned"];
    if (imp)
        imp.forEach(function (a) {
            if (ignore.indexOf(a) > -1)
                ignore.splice(ignore.indexOf(a));
        });
    socket.emit('setKey', {
        name: 'torrents',
        key: id,
        value: torrents[id],
        ignore: ignore
    });
}
var sessionMiddleware = session({
    secret: "XYeMBetaCloud",
    resave: false,
    saveUninitialized: true
});
//set up express
app.use(sessionMiddleware);
//set up unblocker
app.set("trust proxy", true);
app.use(unblocker(middleware));
app.use('/', express.static(path.join(__dirname, '../static')));
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
    //Welcome new client
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
            clearVisitedPage(id);
        });
    });
    client.on('clearTorrents', function () {
        Object.keys(torrents).forEach(function (id) {
            clearTorrent(id);
        });
    });
    client.on('delete', function (data) {
        data.isTorrent ? clearTorrent(data.id) : clearVisitedPage(data.id);
    });
    client.on('saveToDrive', function (data) {
        saveToDriveHandler(sessionID, data);
    });
    client.on('pin', function (data) {
        if (data.isTorrent) {
            torrents[data.page.id].pinned = true;
            sendTorrentsUpdate(io, data.page.id, ["pinned"]);
            return false;
        }
        visitedPages[data.page.id].pinned = true;
        sendVisitedPagesUpdate(io, data.page.id, ["pinned"]);
    });
    client.on('unpin', function (data) {
        if (data.isTorrent) {
            torrents[data.page.id].pinned = false;
            sendTorrentsUpdate(io, data.page.id, ["pinned"]);
            return false;
        }
        visitedPages[data.page.id].pinned = false;
        sendVisitedPagesUpdate(io, data.page.id, ["pinned"]);
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
        var dupes = Object.keys(torrents).filter(function (key) {
            return magnet.decode(data.magnet).infoHash == torrents[key].infoHash;
        });
        if (dupes.length > 0) {
            return false;
        }
        var uniqid = shortid();
        torrentObjs[uniqid] = new Torrent_1.Torrent(data.magnet, FILES_PATH, uniqid);
        torrentObjs[uniqid].on("downloaded", function (path) {
            //CLOUD.uploadDir(path, oauth2ClientArray[sessionID]);
            torrents[uniqid].uploadTo.forEach(function (sessionId) {
                uploadDirToDrive(sessionId, { id: uniqid });
            });
        });
        torrentObjs[uniqid].on("info", function (info) {
            torrents[uniqid] = {
                id: uniqid,
                name: info.name,
                infoHash: info.infoHash,
                size: prettyBytes(info.length),
                isTorrent: true,
                length: info.length,
                msg: 'Connecting to peers',
                uploadTo: []
            };
            sendTorrentsUpdate(client, uniqid);
            client.emit("setObj", {
                name: 'magnetLoading',
                value: false
            });
        });
        torrentObjs[uniqid].on("progress", function (data) {
            if ((torrents[uniqid].progress == 100) || !torrents[uniqid]) {
                return;
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
        torrents[id].showFiles = true;
        sendTorrentsUpdate(client, id);
        //fix directory structure not hidden after page reload
        torrents[id].showFiles = false;
    });
    client.on("uploadDirToDrive", function (data) {
        uploadDirToDrive(sessionID, data);
    });
    client.on("zip", function (data) {
        //exclusively for torrents
        var id = data.id;
        if (torrents[id].zipping || torrents[id].progress < 100) {
            //invalid context
            return false;
        }
        var zippedLength = 0;
        //no need to check if zip exists
        //event will emit only if zipExists is not set
        var output = FILE.createWriteStream(path.join(FILES_PATH, id + ".zip"));
        var archive = archiver('zip', {
            store: true // Sets the compression method to STORE.
        });
        // listen for all archive data to be written
        output.on('close', function () {
            debug("Zipped %s successfully", id);
            torrents[id].zipping = false;
            torrents[id].msg = "Zipped Successfully";
            torrents[id].zipExists = true;
            sendTorrentsUpdate(io, id);
        });
        archive.on('error', function (err) {
            debug("Error while zipping %s : %s", id, err);
        });
        // pipe archive data to the file
        archive.pipe(output);
        archive.directory(path.join(FILES_PATH, id), false);
        archive.finalize();
        var percent = 0;
        //listen for progress
        archive.on("data", function (chunk) {
            zippedLength += chunk.length;
            var percentNow = percentage(zippedLength / torrents[id].length);
            if ((percentNow - percent) > 0.1 || percentNow == 100) {
                percent = percentNow;
                torrents[id].msg = "Zipping : " + percentNow + "%";
                torrents[id].zipping = true;
                sendTorrentsUpdate(io, id);
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
    client.on("uploadZipToCloud", function (data) {
        var id = data.id;
        var name = data.name;
        var loc = path.join(FILES_PATH, id + ".zip");
        var cloudInstance = new CLOUD();
        cloudInstance.uploadFile(FILE.createReadStream(loc), torrents[id].length, mime.lookup(loc), name, oauth2ClientArray[sessionID], false);
        cloudInstance.on("progress", function (data) {
            torrents[id].msg = "Uploading Zip: " + percentage(data.uploaded / data.size) + "%";
            torrents[id].zipping = true;
            sendTorrentsUpdate(io, id);
        });
        cloudInstance.on("fileUploaded", function (data) {
            torrents[id].msg = "Uploaded Zip Successfully";
            torrents[id].zipping = false;
            sendTorrentsUpdate(io, id);
        });
    });
});
//////////////////////////////
//CLOUD CMD START
/////////////////////////////
var cloudcmd = require('cloudcmd');
var prefix = '/cloudcmd';
var config = {
    prefix: prefix,
    auth: true,
    username: (process.env.CLOUDCMD_U || 'root'),
    password: (process.env.CLOUDCMD_P || 'root')
};
var socket = socketIO.listen(server, {
    path: prefix + "/socket.io"
});
app.use(cloudcmd({
    socket: socket,
    config: config
}));
///////////////////////////////
//CLOUD CMD END
///////////////////////////////
server.listen(PORT);
debug('Server Listening on port:', PORT);
console.log("Server Started");
//# sourceMappingURL=server.js.map