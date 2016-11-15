"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var torrentStream = require('torrent-stream');
var path = require('path');
var events_1 = require('events');
var shortid = require("shortid");
var debug = require("debug")("Cloud::TorrentEngine");
var Torrent = (function (_super) {
    __extends(Torrent, _super);
    function Torrent(magnet, folderPath) {
        _super.call(this);
        this.magnetLink = magnet;
        this.saveToFolderPath = folderPath;
        this.initEngine();
    }
    Torrent.prototype.initEngine = function () {
        this.uniqid = shortid();
        var folderPath = path.join(this.saveToFolderPath, this.uniqid);
        this.engine = torrentStream(this.magnetLink, {
            path: folderPath
        });
    };
    Torrent.prototype.handleEngine = function () {
        var _this = this;
        this.engine.on('ready', function () {
            _this.engine.files.forEach(function (file) {
                file.select();
            });
        });
        this.engine.on("idle", function () {
            debug('Torrent downloaded, id: %s', _this.uniqid);
            _this.emit("downloaded", { path: path.join(_this.saveToFolderPath, _this.uniqid) });
        });
    };
    return Torrent;
}(events_1.EventEmitter));
exports.Torrent = Torrent;
//# sourceMappingURL=Torrent.js.map