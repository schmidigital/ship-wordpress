'use strict';

/**
 * Local environment settings
 *
 * While you're DEVELOPING your app, this config file should include
 * any settings specifically for your development computer (db passwords, etc.)
 */
module.exports = {
    url: 'foo.bar.de',
    environment: 'development',
    auto_www: false,
    ssl: {
        active: false,
        email: 'foo@bar.de',
        url: 'foo.bar.de'
    }
};