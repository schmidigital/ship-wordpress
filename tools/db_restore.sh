#!/bin/bash
export ROOT=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

export PATH=/opt/remi/php70/root/usr/bin:/opt/remi/php70/root/usr/sbin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Reset DB
wp db reset --yes --allow-root


FILES="/dump/*.sql"
for f in $FILES
do
	wp db import --allow-root $f
done

echo "Setting base_url to $WORDPRESS_BASE_URL"
wp --allow-root option update siteurl "http://${WORDPRESS_BASE_URL}"
wp --allow-root option update home "http://${WORDPRESS_BASE_URL}"