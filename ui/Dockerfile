FROM nginxinc/nginx-unprivileged:1.31-alpine

COPY docker/ui.nginx.conf /etc/nginx/conf.d/default.conf
COPY ui/ /usr/share/nginx/html/

EXPOSE 8080
