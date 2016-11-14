var socket = io.connect();
var app = angular.module("app", []);
const parts = ['downloadItem'];

app.controller("main", function ($scope, $timeout) {
    //Init
    $scope.visitedPages = {};
    $scope.currentSearchPage = 0;
    $scope.connected = false;
    $scope.search = { loading: false, results: null };
    //socket emits
    socket.on('setKey', function (data) {
        var name = data.name;
        var key = data.key;
        var value = data.value;
        $timeout(function () {
            $scope[name][key] = value;
        });
    });
    socket.on('setObj', function (data) {
        var name = data.name;
        var value = data.value;
        $timeout(function () {
            $scope[name] = value;
        });
    })
    socket.on('deleteKey', function (data) {
        var name = data.name;
        var key = data.key;
        if ($scope[name][key]) {
            $timeout(function () {
                delete $scope[name][key];
            });
        }
    });
    socket.on('disconnect', function () {
        $timeout(function () {
            $scope.connected = false;
        });
    });
    socket.on('connect', function () {
        $timeout(function () {
            $scope.connected = true;
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
        if (!$scope.status.logged) {
            window.location = url;
        }
    }
    $scope.openUrl = function () {
        window.open(window.location.origin + '/proxy/' + $scope.url);
    }
    $scope.isUrl = function () {
        if ($scope.url) {
            return ($scope.url.startsWith('http:') || $scope.url.startsWith('https:'));
        } else {
            return null;
        }
    }
    $scope.processForm = function () {
        if ($scope.isUrl()) {
            $scope.openUrl();
        } else {
            socket.emit('pirateSearch', { query: $scope.url, page: $scope.currentSearchPage });
            $scope.search.loading = true;
        }
    }
    $scope.addTorrent = function (magnetLink) {
        socket.emit('addTorrent', { magnet: magnetLink });
    }
    $scope.numKeys = function (obj) {
        return Object.keys(obj).length;
    }
});