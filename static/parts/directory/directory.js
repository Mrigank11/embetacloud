app.directive('directory', function ($compile) {
    return {
        restrict: 'E',
        scope: {
            dir: '=',
            href: '=',
            torrent: '='
        },
        templateUrl: 'parts/directory/directory.html',
        link: function (scope, element, attrs) {
            scope.childHref = scope.href + '/' + scope.dir.name;
            if (scope.dir.children.length > 0) {
                var el = $compile('<div ng-if="dir.showChildren" class="directoryChildren" ><directory dir="child" href="childHref" torrent="torrent" ng-repeat="child in dir.children" ></directory></div>')(scope);
                element.append(el);
            }
            scope.toggle = function () {
                scope.dir.showChildren = !scope.dir.showChildren;
            }
        }
    }
});