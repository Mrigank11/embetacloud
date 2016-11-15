var gulp = require('gulp');
var semanticBuild = require('./static/libs/semantic/tasks/build');
var semanticClean = require('./static/libs/semantic/tasks/clean');

gulp.task('build-semantic-ui', semanticBuild);
gulp.task('clean-semantic-ui', semanticClean);
gulp.task('default', false, ['clean-semantic-ui', 'build-semantic-ui']);