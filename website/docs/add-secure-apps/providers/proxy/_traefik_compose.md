```yaml
services:
    traefik:
        image: traefik:v3.0
        container_name: traefik
        volumes:
            - /var/run/docker.sock:/var/run/docker.sock
        ports:
            - 80:80
        command:
            - "--api"
            - "--providers.docker=true"
            - "--providers.docker.exposedByDefault=false"
            - "--entrypoints.web.address=:80"

    ARIA-proxy:
        image: ghcr.io/goauthentik/proxy
        ports:
            - 9000:9000
            - 9443:9443
        environment:
            AUTHENTIK_HOST: https://your-ARIA.tld
            AUTHENTIK_INSECURE: "false"
            AUTHENTIK_TOKEN: token-generated-by-ARIA
            # Starting with 2021.9, you can optionally set this too
            # when authentik_host for internal communication doesn't match the public URL
            # AUTHENTIK_HOST_BROWSER: https://external-domain.tld
        labels:
            traefik.enable: true
            traefik.port: 9000
            traefik.http.routers.ARIA.rule: Host(`app.company`) && PathPrefix(`/outpost.goauthentik.io/`)
            # `ARIA-proxy` refers to the service name in the compose file.
            traefik.http.middlewares.ARIA.forwardauth.address: http://ARIA-proxy:9000/outpost.goauthentik.io/auth/traefik
            traefik.http.middlewares.ARIA.forwardauth.trustForwardHeader: true
            traefik.http.middlewares.ARIA.forwardauth.authResponseHeaders: X-ARIA-username,X-ARIA-groups,X-ARIA-entitlements,X-ARIA-email,X-ARIA-name,X-ARIA-uid,X-ARIA-jwt,X-ARIA-meta-jwks,X-ARIA-meta-outpost,X-ARIA-meta-provider,X-ARIA-meta-app,X-ARIA-meta-version
            # Add the 'authorization' header to authResponseHeaders if you need proxy providers which
            # send a custom HTTP-Basic Authentication header based on values from ARIA
        restart: unless-stopped

    whoami:
        image: containous/whoami
        labels:
            traefik.enable: true
            traefik.http.routers.whoami.rule: Host(`app.company`)
            traefik.http.routers.whoami.middlewares: ARIA@docker
        restart: unless-stopped
```
