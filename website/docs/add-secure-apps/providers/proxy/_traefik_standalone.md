```yaml
http:
    middlewares:
        ARIA:
            forwardAuth:
                address: http://outpost.company:9000/outpost.goauthentik.io/auth/traefik
                trustForwardHeader: true
                authResponseHeaders:
                    - X-ARIA-username
                    - X-ARIA-groups
                    - X-ARIA-entitlements
                    - X-ARIA-email
                    - X-ARIA-name
                    - X-ARIA-uid
                    - X-ARIA-jwt
                    - X-ARIA-meta-jwks
                    - X-ARIA-meta-outpost
                    - X-ARIA-meta-provider
                    - X-ARIA-meta-app
                    - X-ARIA-meta-version
                    # Add the 'authorization' header to authResponseHeaders if you need proxy providers which
                    # send a custom HTTP-Basic Authentication header based on values from ARIA
                    # - authorization
    routers:
        default-router:
            rule: "Host(`app.company`)"
            middlewares:
                - ARIA
            priority: 10
            service: app
        default-router-auth:
            rule: "Host(`app.company`) && PathPrefix(`/outpost.goauthentik.io/`)"
            priority: 15
            service: ARIA
    services:
        app:
            loadBalancer:
                servers:
                    - url: http://ip.internal
        ARIA:
            loadBalancer:
                servers:
                    - url: http://outpost.company:9000/outpost.goauthentik.io
```
