const PORT = Number(process.env.PORT || 3000);
const PARENT_HOST = '127.0.0.1';
const http = require('http');
//const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
//const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URL = 'https://directtodrive.herokuapp.com/oauthCallback';
const SCOPES = [
    'https://www.googleapis.com/auth/plus.me',
    'https://www.googleapis.com/auth/drive'
];
const google = require('googleapis');
const FILE = require('fs');
//const OAuth2 = google.auth.OAuth2;
//const oauth2Client = new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
//google.options({ auth: oauth2Client }); // set auth as a global default

function getConsentPageURL() {
    var url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes
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

function uploadToDrive(localFile,mime,fileName) {
    var drive = google.drive({ version: 'v3'});
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

function handler(request, response) {
    var requested_url = request.url;  //like /someUrl
    var host = request.headers.host;  //like host.com
    if (host.includes(PARENT_HOST)) {
        //running at server
        if (requested_url == '/') {
            //serve with google login page
            FILE.readFile("index.html", (data) => {
                response.writeHead(200);
                response.end(data);
            });
        } else if (requested_url.includes('/oauthCallback')) {
            //handle oauth Callback
            handleOauthCallBack(requested_url);
        } else {
            response.writeHead(404);
            response.end('<h1>404 Not Found</h1>');
        }
    } else {
        //is being used as proxy
    }
}

http.createServer(handler).listen(PORT);