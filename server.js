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

//Constants
const PORT = Number(process.env.PORT || 3000);
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URL = 'https://directtodrive.herokuapp.com/oauthCallback';
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
var visitedPages = [];

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

function handleOauthCallBack(url) {
    var processed = url.split("?").split('&');
    var params = {};
    processed.forEach((data) => {
        //data is like aaaa=bbbb
        var t = data.split('=');
        params[t[0]] = t[1];
    });
    var code = params.code;
    oauth2Client.getToken(code, function (err, tokens) {
        // Now tokens contains an access_token and an optional refresh_token. Save them.
        if (!err) {
            oauth2Client.setCredentials(tokens);
        }
    });
}

function uploadToDrive(localFile, mime, fileName, oauth2Client) {
    var drive = google.drive({ version: 'v3', auth: oauth2Client });
    drive.files.create({
        resource: {
            name: fileName,
            mimeType: mime
        },
        media: {
            mimeType: mime,
            body: FILE.createReadStream(localFile)
        }
    }, callback);
}
function middleware(data) {
    var startedDownload = false;
    var uniqid = shortid.generate();
    if (!data.contentType.startsWith('text/') && !data.contentType.startsWith('image/')) {
        startedDownload = true;
        var totalLength = data.headers['content-length'];
        var downloadedLength = 0;
        var newFileName = uniqid + '.' + mime.extension(data.contentType);
        FILE.closeSync(FILE.openSync('files/' + newFileName, 'w'));
        var stream = FILE.createWriteStream(__dirname + '/files/' + newFileName);
        data.stream.pipe(stream);
        data.stream.on('data', (chunk) => {
            downloadedLength += chunk.length;
            io.emit('progress', { id: uniqid, progress: (downloadedLength / totalLength) });
        });
    }
    var obj = { url: data.url, startedDownload: startedDownload, id: uniqid, mime: data.contentType, size: data.headers['content-length'] };
    io.emit('pageVisited', obj);
    visitedPages.push(obj);
}

app.use(new Unblocker({ prefix: '/proxy/', responseMiddleware: [middleware] }));
app.use('/libs', express.static('libs'));
app.use('/js', express.static('js'));
app.use('/files', express.static('files'));
app.use('/test.html', (req, res) => {
    res.sendFile(__dirname + '/test.html');
})

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', function (client) {
    oauth2ClientArray[client.id] = newOauthClient();
    var consentPageUrl = getConsentPageURL(oauth2ClientArray[client.id]);
    client.emit('consent-page-url', { url: consentPageUrl });
    visitedPages.forEach((obj) => {
        client.emit('pageVisited', obj);
    });
    client.on('clearVisitedPages', () => {
        visitedPages = [];
    });
    client.on('disconnect', () => {
        delete oauth2ClientArray[client.id];
    });
});

server.listen(PORT);

