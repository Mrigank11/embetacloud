var gulp = require('gulp-help')(require('gulp'));
var semanticBuild = require('./static/libs/semantic/tasks/build');
var semanticClean = require('./static/libs/semantic/tasks/clean');

gulp.task('build-semantic-ui', 'Build Semantic UI files', semanticBuild);
gulp.task('clean-semantic-ui', 'Clean Semantic UI files', semanticClean);
gulp.task('default', false, ['clean-semantic-ui', 'build-semantic-ui']);