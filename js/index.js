var socket = io.connect();
var app = angular.module("app", []);
app.controller("main", function ($scope, $timeout) {
    //Init
    $scope.visitedPages = {};
    //socket emits
    socket.on('status', function (data) {
        $timeout(function () {
            $scope.status = {};
            $scope.status.consentPageUrl = data.url;
            $scope.status.logged = data.logged;
        });
    });
    socket.on('pageVisited', function (data) {
        $timeout(function () {
            $scope.visitedPages[data.id] = data;
        });
    });
    socket.on('progress', function (data) {
        $scope.setProgress(data);
    });
    socket.on('msg', function (data) {
        var id = data.id;
        var msg = data.msg;
        $timeout(function () {
            $scope.visitedPages[id].msg = msg;
        });
    });
    //Functions
    $scope.togglePin = function (page) {
        if (page.pinned) {
            socket.emit('unpin', { page: page });
            page.pinned = false;
        } else {
            socket.emit('pin', { page: page });
            page.pinned = true;
        }
    }
    $scope.downloadToPC = function (page) {
        window.location.href = page.path;
    }
    $scope.downloadToDrive = function (page) {
        var filename = prompt("Enter File Name: ");
        if (filename) {
            socket.emit('saveToDrive', { data: page, name: filename });
            $timeout(function () {
                $scope.visitedPages[page.id].msg = "Uploading To Drive";
            });
        }
    }
    $scope.clearVisitedPages = function () {
        Object.keys($scope.visitedPages).forEach((id) => {
            if (!$scope.visitedPages[id].pinned) {
                delete $scope.visitedPages[id];
            }
        });
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
        if (!obj && !data.cleared) {
            $scope.visitedPages[data.id] = data;
            obj = data;
        }
        if (data.progress) {
            $timeout(function () {
                $scope.visitedPages[data.id].progress = data.progress;
            });
        }

    }
});