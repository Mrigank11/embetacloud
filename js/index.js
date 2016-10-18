var socket = io.connect();

var app = angular.module("app", []);
app.controller("main", function ($scope,$timeout) {
    socket.emit('get-consent-page-url');
    socket.on('consent-page-url', function (data) {
        $timeout(function(){$scope.consentPageUrl = data.url;});
    });
    $scope.visitedPages=[];
    socket.on('pageVisited',function(data){
        $timeout(function(){$scope.visitedPages.push(data.url)});
    });
    $scope.clearVisitedPages=function(){
        $scope.visitedPages=[];
    }
});