import * as torrentStream from 'torrent-stream';
import * as path from 'path';
import { EventEmitter } from 'events';
const shortid = require("shortid");
const debug = require("debug")("eMCloud::TorrentEngine");

export class Torrent extends EventEmitter {
    private magnetLink;
    private saveToFolderPath;
    private uniqid;
    private engine;
    constructor(magnet: string, folderPath: string) {
        super();
        this.magnetLink = magnet;
        this.saveToFolderPath = folderPath;
        this.initEngine();
    }
    private initEngine() {
        this.uniqid = shortid();
        var folderPath = path.join(this.saveToFolderPath, this.uniqid);
        this.engine = torrentStream(this.magnetLink, {
            path: folderPath
        });
    }
    private handleEngine() {
        this.engine.on('ready', () => {
            this.engine.files.forEach(function (file) {
                file.select();
            });
        });
        this.engine.on("idle", () => {
            debug('Torrent downloaded, id: %s', this.uniqid);
            this.emit("downloaded", { path: path.join(this.saveToFolderPath, this.uniqid) });
        });
    }
}