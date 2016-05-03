var util = require('ship-util')


console.log("bower install")
util.shell("bower install", true);

console.log("npm install")
util.shell("npm install", true);

console.log("Using gulp magic to create css and js for live")
util.shell("gulp dist", true);


try {
  process.chdir(www_dir);
  console.log('New directory: ' + process.cwd());
}
catch (err) {
  console.log('chdir: ' + err);
}

process.env.WORDPRESS_DB_NAME = process.env.WORDPRESS_DB_NAME + "." + branch;

util.shell( script_dir + "/wp_config.sh")



console.log("Import current dump");
console.log(syncExec("wp db reset --yes").stdout)

var database_dir = project_dir + '/database/';

fs.readdir( database_dir,function(err,files){
    if(err) throw err;
    files.forEach(function(file){
      console.log(syncExec("wp db import " + database_dir + file).stdout)
    });

    console.log(syncExec('wp option update siteurl "http://"' + config.url).stdout)
    console.log(syncExec('wp option update home "http://"' + config.url).stdout)

});