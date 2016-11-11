//Requires
const google = require('googleapis');
const FILE = require('fs');
const url = require('url');
const Unblocker = require('unblocker');
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const shortid = require('shortid');
const mime = require('mime');
const session = require('express-session');
const PirateBay = require('thepiratebay');
const prettyBytes = require('pretty-bytes');
const torrentStream = require('torrent-stream');

//Constants
const PORT = Number(process.env.PORT || 3000);
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URL = 'https://embetacloud.herokuapp.com/oauthCallback';
//const REDIRECT_URL = 'http://127.0.0.1:3000/oauthCallback';
const SCOPES = [
    'https://www.googleapis.com/auth/plus.me',
    'https://www.googleapis.com/auth/drive'
];

//Init
const OAuth2 = google.auth.OAuth2;
var oauth2ClientArray = {};
var capture = false;
var app = express();
var server = http.createServer(app);
var io = socketIO(server);
var visitedPages = {};

function newOauthClient() {
    return new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
}
function getConsentPageURL(oauth2Client) {
    var url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
    });
    return url;
}

function uploadToDrive(stream, mime, fileName, oauth2Client, callback) {
    var drive = google.drive({ version: 'v3', auth: oauth2Client });
    return drive.files.create({
        resource: {
            name: fileName,
            mimeType: mime
        },
        media: {
            mimeType: mime,
            body: stream
        }
    }, callback);
}
//TODO send pageVisited to its respective user using sessionID
function middleware(data) {
    var uniqid = shortid.generate();
    var sessionID = data.clientRequest.sessionID;
    var newFileName = null;
    if (!data.contentType.startsWith('text/') && !data.contentType.startsWith('image/')) {
        var totalLength = data.headers['content-length'];
        var downloadedLength = 0;
        newFileName = uniqid + '.' + mime.extension(data.contentType);
        var completeFilePath = __dirname + '/files/' + newFileName;
        //create /files if it doesn't exist 
        if (!FILE.existsSync('files')) {
            FILE.mkdirSync('files');
        }
        FILE.closeSync(FILE.openSync(completeFilePath, 'w')); //create an empty file
        var stream = FILE.createWriteStream(completeFilePath);
        data.stream.pipe(stream);
        data.stream.on('data', (chunk) => {
            downloadedLength += chunk.length;
            progress = Math.round(((downloadedLength / totalLength) * 1000)) / 10;
            if (visitedPages[uniqid]) {
                if (visitedPages[uniqid].cleared) { //download cancelled
                    stream.close();
                    FILE.unlink(completeFilePath);  //delete incomplete file
                    delete visitedPages[uniqid];
                    io.emit('deleteKey', {
                        name: 'visitedPages',
                        key: uniqid
                    });
                } else {
                    visitedPages[uniqid].progress = progress;
                    sendVisitedPagesUpdate(io, uniqid);
                }
            }

        });
        var prevLen = 0;
        var speed;
        var interval = setInterval(() => {
            if (!prevLen == downloadedLength && visitedPages[uniqid]) {
                speed = prettyBytes((downloadedLength - prevLen) * 10);
                visitedPages[uniqid].speed = speed;
                sendVisitedPagesUpdate(io, uniqid);
            }
            prevLen = downloadedLength;
            if (totalLength == downloadedLength) {
                clearInterval(interval);
            }
        }, 100);
        var obj = {
            url: data.url,
            id: uniqid,
            mime: data.contentType,
            size: data.headers['content-length'],
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
app.use('/libs', express.static('libs'));
app.use('/js', express.static('js'));
app.use('/files', express.static('files'));
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});
app.get('/oauthCallback', (req, res) => {
    var sessionID = req.sessionID;
    var oauth2Client = oauth2ClientArray[sessionID];
    if (!oauth2Client) { res.send('Invalid Attempt[E01]'); return false; }
    var code = req.query.code;
    if (code) {
        oauth2Client.getToken(code, function (err, tokens) {
            if (!err) {
                oauth2Client.setCredentials(tokens);
                res.redirect('/');
            } else {
                console.log("Error: " + err);
                res.end('Error Occured');
            }
        });
    } else {
        res.send('Invalid Attempt[E03]');
    }
});
io.use(function (socket, next) {
    sessionMiddleware(socket.conn.request, socket.conn.request.res, next);
});

io.on('connection', function (client) {
    var sessionID = client.conn.request.sessionID;
    if (!oauth2ClientArray[sessionID]) {    //init a new oauth client if not present
        oauth2ClientArray[sessionID] = newOauthClient();
    }
    var consentPageUrl = getConsentPageURL(oauth2ClientArray[sessionID]);
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
    client.on('clearVisitedPages', () => {
        Object.keys(visitedPages).forEach((id) => {
            if (!visitedPages[id].pinned) {
                if (visitedPages[id].progress == 100) {
                    //  download completed but user requested to clear
                    // delete downloaded file
                    FILE.unlink(__dirname + visitedPages[id].path);
                    delete visitedPages[id];
                } else {
                    // download is in progress
                    // partial file will be deleted by middleware function
                    visitedPages[id].cleared = true;
                }
            }
        });
    });
    client.on('saveToDrive', (data) => {
        var obj = data.data;
        var stream = FILE.createReadStream(__dirname + obj.path);
        var req = uploadToDrive(stream, obj.mime, data.name, oauth2ClientArray[sessionID], (err, resp) => {
            if (err) {
                console.log(err);
                var msg = "Error: " + err;
                visitedPages[obj.id].msg = msg;
                sendVisitedPagesUpdate(client, obj.id);
            } else {
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
    client.on('pin', (data) => {
        visitedPages[data.page.id].pinned = true;
    });
    client.on('unpin', (data) => {
        visitedPages[data.page.id].pinned = false;
    });
    client.on('pirateSearch', (data) => {
        var query = data.query;
        var page = data.page;
        PirateBay.search(query).then(results => {
            client.emit('setObj', {
                name: 'search',
                value: {
                    results: results,
                    loading: false
                }
            })
        });
    });
    client.on('addTorrent', (data) => {
        var magnet = data.magnet;
        var engine = torrentStream(magnet);
        var uniqid = shortid();
        engine.on('ready', () => {
            console.log(engine.files);
        });
    });
});

server.listen(PORT);

