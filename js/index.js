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
    socket.on('driveUploadSuccess', function (data) {
        var id = data.id;
        var name = data.name;
        $timeout(function () {
            $scope.visitedPages[id].msg = "Uploaded " + name + " to Drive";
        });
    });
    socket.on('googleDriveProgress', (data) => {
        var percent = data.percent;
        var id = data.id;
        $timeout(function () {
            $scope.visitedPages[id].msg = "Uploaded: " + percent + "%";
        });
    });
    //Functions
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
        $scope.visitedPages = {};
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
        if (!obj) {
            $scope.visitedPages[data.id] = data;
            obj = data;
        }
        if (data.progress) {
            $timeout(function () {
                $scope.visitedPages[data.id].progress = data.progress;
                var progressBar = $('#progress-' + data.id);
                var percent = data.progress;
                var percentNow = progressBar.progress('get percent');
                if (percent >= percentNow) {
                    progressBar.progress({ percent: percent });
                }
            });
        }

    }
});