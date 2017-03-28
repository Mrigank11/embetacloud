"use strict";
var Gdrive_1 = require("./GDrive/Gdrive");
var Storages = (function () {
    function Storages() {
    }
    Storages.getStorage = function (name) {
        if (this.storages[name]) {
            return this.storages[name]["class"];
        }
    };
    Storages.getStorageName = function (name) {
        if (this.storages[name]) {
            return this.storages[name].displayName;
        }
    };
    Storages.getStorages = function () {
        return Object.keys(this.storages);
    };
    Storages.getTemplate = function () {
        var _this = this;
        var obj = {};
        this.getStorages().forEach(function (storage) {
            obj[storage] = {};
            obj[storage].displayName = _this.getStorageName(storage);
            obj[storage].url = _this.getStorage(storage).getURL();
        });
        return obj;
    };
    return Storages;
}());
Storages.storages = {
    "GDrive": {
        "displayName": "Google Drive",
        "class": Gdrive_1.GDrive
    }
};
exports.Storages = Storages;
//# sourceMappingURL=Storages.js.map