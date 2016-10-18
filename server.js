//Requires
const http = require('http');
const google = require('googleapis');
const FILE = require('fs');
const io = require('socket.io');
const url = require('url');
var httpProxy = require('http-proxy');

//Constants
const PORT = Number(process.env.PORT || 3000);
//const PARENT_HOST = '127.0.0.1:3000';
const PARENT_HOST = 'directtodrive.herokuapp.com';
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URL = 'https://directtodrive.herokuapp.com/oauthCallback';
const SCOPES = [
    'https://www.googleapis.com/auth/plus.me',
    'https://www.googleapis.com/auth/drive'
];

//Init
const OAuth2 = google.auth.OAuth2;
const oauth2Client = new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
google.options({ auth: oauth2Client }); // set auth as a global default
var proxy = httpProxy.createProxyServer({}); // init http-proxy

function getConsentPageURL() {
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

function uploadToDrive(localFile, mime, fileName) {
    var drive = google.drive({ version: 'v3' });
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
function give404(response) {
    response.writeHead(404);
    response.end('<h1>404 Not Found</h1>');
}
function handler(request, response) {
    var requested_path = request.url;  //like /someUrl
    var host = request.headers.host;  //like host.com
    if (host.includes(PARENT_HOST)) {
        //running at server
        if (requested_path == '/') {
            //serve with google login page
            FILE.readFile("index.html", (err, data) => {
                response.writeHead(200);
                response.end(data);
            });
        }
        else if (requested_path.startsWith('/libs') || requested_path.startsWith('/js')) {
            FILE.readFile(requested_path.substr(1), (err, data) => {
                if (!err) {
                    response.writeHead(200);
                    response.end(data);
                } else {
                    give404(response);
                }
            });
        }
        else if (requested_path.startsWith('/oauthCallback')) {
            //handle oauth Callback
            handleOauthCallBack(requested_path);
        }
        else {//404
            give404(response);
        }
    } else {
        //is being used as proxy
        listener.emit('pageVisited', { url: request.url });
        proxy.web(request, response, { target: "http://"+request.headers.host },(e)=>{
            listener.emit('pageVisited',{url:e});
        });
    }
}

var server = http.createServer(handler);
server.listen(PORT);
var listener = io.listen(server);
listener.sockets.on('connection', function (socket) {
    socket.on('get-consent-page-url', (data) => {
        socket.emit('consent-page-url', { 'url': getConsentPageURL() });
    });
});