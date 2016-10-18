var PORT=Number(process.env.PORT || 3000);

var http = require('http');
handler=function(req,res){
    makeHTTPRequest(req,res);
}

function makeHTTPRequest(request,response) {
    var proxy=http.request(request.headers.host);

    response.writeHead(200);
    response.end('HI');
}

http.createServer(handler).listen(PORT);