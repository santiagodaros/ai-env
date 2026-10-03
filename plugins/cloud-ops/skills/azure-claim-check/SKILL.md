---
name: azure-claim-check
description: Verifica afirmaciones técnicas de Azure contra Microsoft Learn antes de darlas por ciertas. Usar cuando se vaya a afirmar un límite, cuota, SKU, estado GA/Preview, flag de CLI, parámetro de API o comportamiento de un servicio de Azure o Microsoft 365, o cuando el usuario pida "verificá", "chequeá la doc" o "¿es cierto?".
---

# azure-claim-check

No afirmar de memoria lo que puede cambiar: límites, cuotas, precios, GA/Preview, flags de CLI, nombres de parámetros.

## Procedimiento

1. Listar las afirmaciones concretas a verificar (máximo 5 por pasada).
2. Para cada una, `microsoft_docs_search` (Microsoft Learn MCP). Si el extracto no alcanza, `microsoft_docs_fetch` de esa URL. Usar `microsoft_code_sample_search` solo si hace falta código.
3. Para flags de CLI, además correr `az <comando> --help` si hay shell disponible.
4. Clasificar cada afirmación:
   - **Verificada**: coincide con la doc. Citar URL.
   - **Corregida**: la doc dice otra cosa. Decir qué estaba mal y cuál es lo correcto.
   - **No verificada**: no se encontró o las páginas se contradicen. Decirlo y no rellenar.
5. Si hay contradicción entre páginas de Learn, mostrar ambas URLs y recomendar probar en laboratorio.

## Reglas

- Sin fuente, no va como hecho.
- No inflar: mejor "no pude verificarlo" que una certeza inventada.
- Si el usuario tiene un STATE, registrar ahí los hechos verificados con URL y fecha (ver `context-ledger`).

## Requisito

Conector Microsoft Learn MCP (`https://learn.microsoft.com/api/mcp`, sin autenticación). Si no está, avisar y proponer agregarlo.
