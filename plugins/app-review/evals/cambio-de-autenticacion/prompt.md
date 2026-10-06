---
max_turns: 6
allowed_tools: [Skill, Read, Glob, Grep]
tags: [disparo]
---

Antes de mergear, revisá este cambio. En src/auth/token.ts ahora guardo el access token de MSAL en localStorage y el client secret lo leo de VITE_CLIENT_SECRET para llamar a Graph desde el navegador.
