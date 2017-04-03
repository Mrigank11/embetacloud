"use strict";
var GDrive_1 = require("./GDrive/GDrive");
var Mega_1 = require("./Mega/Mega");
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
        "class": GDrive_1.GDrive
    },
    "Mega": {
        "displayName": "Mega",
        "class": Mega_1.Mega
    }
};
exports.Storages = Storages;
//# sourceMappingURL=Storages.js.map