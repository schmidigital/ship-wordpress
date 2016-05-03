/**
 * Module dependencies
 */

var async = require('async'),
    utils = require('ship-utils'),
    fs = require('fs-extra'),
    path = require('path'),
    YAML = require('rsa-yamljs'),
    syncExec = require('sync-exec'),
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

        syncExec('chmod -R +x ' + ship.config.appPath + '/data/tools/*').stdout.replace(/(\r\n|\n|\r)/gm,"")

        var template = YAML.load( path.resolve(__dirname, './template.yml'));
        var stats = fs.statSync(ship.config.appPath + '/package.json');
        var environment_file = require(path.resolve(ship.config.appPath, './config/environment/', ship.config.environment) + '.js');


        // Config Web Container
        template.web.environment = {};
        
        if (ship.config.environment == "production") {
            template.web.environment.LETSENCRYPT_HOST = environment_file.ssl.url;
            template.web.environment.LETSENCRYPT_EMAIL = environment_file.ssl.email;
        }

        var environment_web = {
            DOCKER_USER: "nginx",
            DOCKER_GROUP: "nginx",
            HOST_USER_ID: stats.uid,
            HOST_GROUP_ID: stats.gid,
            VIRTUAL_HOST: environment_file.url,
        }

        _.merge(template.web.environment, environment_web)


        // Creating Nginx Config
        var nginx_template = fs.readFileSync(path.resolve(__dirname, './config/nginx.conf.template')).toString();

        var nginx_config_final = nginx_template.replace(/DOMAIN/g, environment_file.url);
        var nginx_config_final_dest = path.resolve(ship.config.appPath) + '/data/config/nginx.conf';

        fs.mkdirsSync(path.resolve(ship.config.appPath) + '/data/config');
        fs.writeFileSync(nginx_config_final_dest, nginx_config_final); 

        // Creating PHP Config
        template.php.image = "schmidigital/php-wordpress:" + (ship.config.wordpress.php.version || 5) + "-fpm";
        template.php.environment = {};
        
        var environment_php = {
            WORDPRESS_DB_HOST: "db",
            WORDPRESS_DB_NAME: ship.config.wordpress.db.database,
            WORDPRESS_DB_USER: "root",
            WORDPRESS_DB_PASSWORD: ship.config.wordpress.db.root_password,
            WORDPRESS_BASE_URL: environment_file.url
        }
        
        _.merge(template.php.environment, environment_php) 

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
    }



  };
};
