"use strict";
exports.__esModule = true;
var Filter = /** @class */ (function () {
    function Filter() {
    }
    //TODO:add more filters
    Filter.prototype.passed = function (data) {
        var contentType = data.contentType;
        if (contentType.startsWith('text') || contentType.startsWith('image') || contentType == "application/javascript" || contentType.includes("font")) {
            return false;
        }
        else {
            return true;
        }
    };
    return Filter;
}());
exports.Filter = Filter;
//# sourceMappingURL=Filter.js.map