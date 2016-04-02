#!/usr/bin/env node
var spawnAsync = require('child_process').spawnAsync,
    spawnSync = require('child_process').spawnSync,
    spawnargs = require('spawn-args'),
    syncExec = require('sync-exec'),
    async = require('async'),
    fs = require('fs'),
    shell = require('./shell');

var project_dir = process.argv[2]
var www_dir = project_dir + "/www";
var script_dir = __dirname;
var branch = process.argv[3]
var url = process.env.URL;


try {
  process.chdir(project_dir);
  console.log('New directory: ' + process.cwd());
}
catch (err) {
  console.log('chdir: ' + err);
}

async.auto({
  generate_nginx: function (callback) {
    var env = process.env.SHIP_ENV;
    var env_config = YAML.load( __dirname + '/config/env/' + env + '.yml');
    
    console.log("Generate Nginx File using " + env + " environment.")


    fs.readFile( __dirname + '/config/nginx.conf.template', 'utf-8', function (err, data) {
        if (err) throw err; 

        var result = data.replace(/DOMAIN/g, env_config.web.environment.URL);

        fs.writeFile( __dirname + '/config/nginx.conf'
          , result, 'utf8', function (err) {
           if (err) throw err;

           console.log("Successfully created nginx.conf".green)
        });
    });

    callback();
  },
  // TODO: Was machen wir, wenns die Branches noch nicht gibt? Anlegen?
  //       Fehlermeldung ausgeben und fragen, ob man erstellen soll?
  clone_branches: function (callback) {
    console.log("# Clone Branches".blue)

    for (var key in branches) {
      var branch = branches[key]

      if(!fs.existsSync(__dirname + "/www/" + branch)) {
        console.log("Cloning into " + "www/" + branch)
        var exec = syncExec("git clone -b " + branch + " " + settings.web.environment.SITE_REPO + " " +
                          __dirname + "/www/" + branch)
        console.log(exec.stdout)
      } 
      else {
        console.log(__dirname + "/www/" + branch + " already exists!")
      }
    }

    callback();
  },

  setup_branches: ["clone_branches", function (branches, settings) {
    console.log("# Setup Branches".blue)

    for (var key in branches) {
        var branch = branches[key]

        if(fs.existsSync(__dirname + "/www/" + branch)) {

          var options = { 
            workdir: "/data/www/" + branch,
            user: "www"
          }

          execContainerCommand( "web", "/templates/" + config.profile + "/setup.js " + options.workdir + " " + branch + " " + env, options)


          // Mit Yeoman ausführen! Babam
          //cd(__dirname + "/www/" + branch + "/www")

          //console.log("Set proper wordpress settings")
          //syncExec( __dirname + "/tools/wp_config.sh")

        }
        else {
          console.log("Error: ".red + "Folder " + __dirname + "/www/" + branch + " does not exist")
        }
        
    }
  }]

})



/*
console.log("create config.json");
var config = JSON.parse(require('fs').readFileSync(project_dir + '/config.json.sample', 'utf8'));
config.url = (branch == "master" ? "www" + "." + url : branch + "." + url);
var outputFilename = project_dir + '/config.json';

fs.writeFileSync(outputFilename, JSON.stringify(config, null, 4)); 
*/



//spawn( __dirname + "/tools/wp_config.sh")
