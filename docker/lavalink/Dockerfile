FROM ghcr.io/lavalink-devs/lavalink:4

USER root

# Config + plugin embebidos: evita bind mounts con permisos incorrectos en OMV/NAS.
COPY application.yml /opt/Lavalink/application.yml

RUN mkdir -p /opt/Lavalink/plugins

ADD https://maven.lavalink.dev/releases/dev/lavalink/youtube/youtube-plugin/1.18.1/youtube-plugin-1.18.1.jar \
    /opt/Lavalink/plugins/youtube-plugin-1.18.1.jar

RUN chown -R lavalink:lavalink /opt/Lavalink/application.yml /opt/Lavalink/plugins

USER lavalink
