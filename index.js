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
        var stats = fs.statSync(ship.config.appPath + '/package.json');
        var environment_file = require(path.resolve(ship.config.appPath, './config/environment/', ship.config.environment) + '.js');


        // Config Wordpress Container
        template.wordpress.environment = {};
        
        if (environment_file.ssl && environment_file.ssl.active) {
            template.wordpress.environment.LETSENCRYPT_HOST = environment_file.ssl.url;
            template.wordpress.environment.LETSENCRYPT_EMAIL = environment_file.ssl.email;
        }
        
        var virtual_host_wordpress = (ship.config.angular ? "wordpress." + environment_file.url : environment_file.url)

        var environment_wordpress = {
            DOCKER_USER: "www-data",
            DOCKER_GROUP: "www-data",
            HOST_USER_ID: stats.uid,
            HOST_GROUP_ID: stats.gid,
            VIRTUAL_HOST: virtual_host_wordpress,
        }

        _.merge(template.wordpress.environment, environment_wordpress)

        
        // Config Angular2 Container (Optional)
        if (ship.config.angular) {
            var template_angular = YAML.load( path.resolve(__dirname, './template_angular.yml'));
            template_angular.angular.environment = {}
            
            var environment_angular = {
                /*DOCKER_USER: "www-data",
                DOCKER_GROUP: "www-data",
                HOST_USER_ID: stats.uid,
                HOST_GROUP_ID: stats.gid,*/
                VIRTUAL_HOST: environment_file.url
            }
            
            _.merge(template_angular.angular.environment, environment_angular);
            template = _.merge(template, template_angular);
        }


        // Creating Nginx Config
        var nginx_template = fs.readFileSync(path.resolve(__dirname, './config/nginx.conf.template')).toString();
        var domains = "www." + environment_file.url + " " + environment_file.url;

        if (ship.config.angular) 
            domains = "wordpress." + environment_file.url;
            
        var nginx_config_final = nginx_template.replace(/DOMAINS/g, domains);
        
        var nginx_config_final_dest = path.resolve(ship.config.appPath) + '/data/config/nginx.conf';

        fs.mkdirsSync(path.resolve(ship.config.appPath) + '/data/config');
        fs.writeFileSync(nginx_config_final_dest, nginx_config_final); 


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
        http.get({
            hostname: 'api.wordpress.org',
            port: 80,
            path: '/secret-key/1.1/salt',
            agent: false  // create a new agent just for this one request
            }, (res) => {
                res.setEncoding('utf8');
                res.on('data', function (salt) {
                    wp_config_file = wp_config_file.replace("SALT_BLOCK", salt)
                    
                    wp_config_file = wp_config_file.replace("database_name_here", ship.config.wordpress.db.database)
                    wp_config_file = wp_config_file.replace("username_here", ship.config.wordpress.db.user)
                    wp_config_file = wp_config_file.replace("password_here", ship.config.wordpress.db.password)
                    wp_config_file = wp_config_file.replace("localhost", "db");
                    
                    var wp_config_dest = path.resolve(ship.config.appPath) + '/www/wordpress/wp-config.php';
        
                    fs.writeFileSync(wp_config_dest, wp_config_file); 
                });
                // Do stuff with response
        })
        
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

        
        //utils.shell("docker-compose up -d")
    }



  };
};
