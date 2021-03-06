/**
 * Module dependencies
 */

var async = require('async'),
    utils = require('ship-utils'),
    fs = require('fs-extra'),
    path = require('path'),
    YAML = require('rsa-yamljs'),
    syncExec = require('sync-exec'),
    http = require('http'),
    _ = require('lodash');



/**
 * Profile Loader hook
 * 
 * Loads the settings and default commands for any given profile.
 * e.g. wordpress, odoo, magento, etc.
 *
 * @param  {ShipApp} ship
 * @return {Dictionary} [hook definition]
 */
module.exports = function (ship) {

  /**
   * Build the hook definition.
   * (this is returned below)
   *
   * @type {Dictionary}
   */
  return {


    /**
     * defaults
     *
     * The implicit configuration defaults merged into `sails.config` by this hook.
     *
     * @type {Dictionary}
     */
    defaults: {
        wordpress: {
        }
    },



    /**
     * configure()
     *
     * @type {Function}
     */
    configure: function() {

    },



    /**
     * initialize()
     *
     * Logic to run when this hook loads.
     */
    initialize: function (next) {
      return next(); 
    },
    
    start: function (params) {
      
        // Copy Tools
        fs.copySync(path.resolve(__dirname,'./tools'), path.resolve(ship.config.appPath, './data/tools'));
        fs.copySync(path.resolve(__dirname,'./images'), path.resolve(ship.config.appPath, './data/images'));

        syncExec('chmod -R +x ' + ship.config.appPath + '/data/tools/*').stdout.replace(/(\r\n|\n|\r)/gm,"")

        var template = YAML.load( path.resolve(__dirname, './template.yml'));
        
        var environment_file = require(path.resolve(ship.config.appPath, './config/environment/', ship.config.environment) + '.js');

        var stats = fs.statSync(ship.config.appPath + '/package.json');

        // Workaround for virtualbox, which always maps to 1000:50
        if (environment_file.driver == "virtualbox") {
            stats.uid = 1000;
            stats.gid = 50;            
        }

        // Config Wordpress Container
        template.wordpress.environment = {};
        

        var virtual_domains = environment_file.url
                              + "," + "admin." + environment_file.url;
        if (ship.config.auto_www) {
            virtual_domains += ",www." + environment_file.url
        }
   
        if (environment_file.ssl && environment_file.ssl.active) {
            template.wordpress.environment.LETSENCRYPT_HOST = virtual_domains;
            template.wordpress.environment.LETSENCRYPT_EMAIL = environment_file.ssl.email;
        }
        
        if (ship.config.environment == "development")
            template.wordpress.ports = ["4000:80"];
            
            console.log(ship.config.environment)
             
        var environment_wordpress = {
            DOCKER_USER: "www-data",
            DOCKER_GROUP: "www-data",
            HOST_USER_ID: stats.uid,
            HOST_GROUP_ID: stats.gid,
            VIRTUAL_HOST: virtual_domains,
        }

        _.merge(template.wordpress.environment, environment_wordpress)

        // Creating Sites Config
        var sites_config_file = "sites.conf.template";
        
        var sites_config_template = fs.readFileSync(path.resolve(__dirname, './config/' + sites_config_file)).toString();
        var sites_config_final = sites_config_template.replace(/DOMAIN/g, environment_file.url);
        var sites_config_final_dest = path.resolve(ship.config.appPath) + '/data/config/sites.conf';

        fs.mkdirsSync(path.resolve(ship.config.appPath) + '/data/config');
        fs.writeFileSync(sites_config_final_dest, sites_config_final); 
        
        
        // Creating Nginx Config
        var nginx_config_file = fs.readFileSync(path.resolve(__dirname, './config/nginx.conf.template')).toString();
        var nginx_config_final_dest = path.resolve(ship.config.appPath) + '/data/config/nginx.conf';
        fs.writeFileSync(nginx_config_final_dest, nginx_config_file); 


        // Config PHP Container
        template.php.image = "schmidigital/php-wordpress:" + (ship.config.wordpress.php.version || 5) + "-fpm";
        template.php.environment = {};
        
        var environment_php = {
            DOCKER_USER: "www-data",
            DOCKER_GROUP: "www-data",
            HOST_USER_ID: stats.uid,
            HOST_GROUP_ID: stats.gid
        }
        
        _.merge(template.php.environment, environment_php) 


        // Create Wordpress Config
        var wp_config_file = fs.readFileSync(path.resolve(__dirname, './config/wp-config.php.template')).toString();
        
        // Get Salt from WP API
        var request =  http.get({
            hostname: 'api.wordpress.org',
            port: 80,
            path: '/secret-key/1.1/salt',
            agent: false  // create a new agent just for this one request
            }, (res) => {
                res.setEncoding('utf8');
                var salt = "";

                res.on('data', function (data) {
                    salt += data;
                });
                
                res.on('end', function () {
                    write_config(salt);
                });            
        })
        
        request.on('error', function (err) {
            console.log("No Internet Connection or Wordpress Site not reachable! Could not get hash salt for Wordpress :/");
            write_config("// No Salt specified");
        });
        
        function write_config (salt) {
            wp_config_file = wp_config_file.replace("SALT_BLOCK", salt);
                    
            wp_config_file = wp_config_file.replace("database_name_here", ship.config.wordpress.db.database)
            wp_config_file = wp_config_file.replace("username_here", ship.config.wordpress.db.user)
            wp_config_file = wp_config_file.replace("password_here", ship.config.wordpress.db.password)
            wp_config_file = wp_config_file.replace("localhost", "db");
            
            var wp_domain = (environment_file.ssl && environment_file.ssl.active ? "https://" : "http://");
            wp_domain += (ship.config.auto_www ? "www." : "") + environment_file.url;
            
            wp_config_file = wp_config_file.replace(/DOMAIN/g, wp_domain);
            
            
            var wp_config_dest = path.resolve(ship.config.appPath) + '/www/wordpress/wp-config.php';
            
            fs.writeFileSync(wp_config_dest, wp_config_file); 
        }
        
        // Config DB Container
        template.db.environment = {};
        
        var environment_db = {
            DOCKER_USER: "mysql", 
            DOCKER_GROUP: "mysql",
            HOST_USER_ID: stats.uid,
            HOST_GROUP_ID: stats.gid,
            MYSQL_ROOT_PASSWORD: ship.config.wordpress.db.root_password,
            MYSQL_DATABASE: ship.config.wordpress.db.database,
            MYSQL_USER: ship.config.wordpress.db.user,
            MYSQL_PASSWORD: ship.config.wordpress.db.password
        }
        
        _.merge(template.db.environment, environment_db) 

        var docker_compose_file = YAML.stringify(template, 4);
        var docker_compose_dest = path.resolve(ship.config.appPath) + '/docker-compose.yml';
        
        fs.writeFileSync(docker_compose_dest, docker_compose_file); 

        
        utils.shell("docker-compose up -d")
        
        //process.chdir('./www/angular');
        //utils.shell("npm start")
    }


  };
};
