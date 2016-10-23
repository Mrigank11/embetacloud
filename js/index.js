var socket = io.connect();

var app = angular.module("app", []);
app.controller("main", function ($scope, $timeout) {
    //Init
    $scope.visitedPages = {};
    //socket emits
    socket.on('consent-page-url', function (data) {
        $timeout(function () { $scope.consentPageUrl = data.url; });
    });
    socket.on('pageVisited', function (data) {
        $timeout(function () {
            $scope.visitedPages[data.id] = data;
        });
    });
    socket.on('progress', function (data) {
        $scope.setProgress(data);
    });
    //Functions
    $scope.clearVisitedPages = function () {
        $scope.visitedPages = [];
        socket.emit('clearVisitedPages');
    }
    $scope.redirectToLoginUrl = function (url) {
        window.location = url;
    }
    $scope.openUrl = function () {
        window.open(window.location.origin + '/proxy/' + $scope.url);
    }
    $scope.setProgress = function (data) {
        var obj = $scope.visitedPages[data.id];
        if (obj) {
            obj.progress = data.progress;
            var progressBarId = 'progress-' + data.id;
            $('#' + progressBarId).progress();
        } else {
            setTimeout(function () {
                $scope.setProgress(data);
            }, 100);
        }
    }
});