# Consultas base (Resource Graph)

Sin validar contra un tenant real. Probar en laboratorio.

## Servidores SQL y acceso de red público

```kusto
resources
| where type =~ 'microsoft.sql/servers'
| project name, resourceGroup, subscriptionId, location,
          publicNetworkAccess = tostring(properties.publicNetworkAccess)
| order by publicNetworkAccess asc, name asc
```

## Storage accounts con acceso público a blobs

```kusto
resources
| where type =~ 'microsoft.storage/storageaccounts'
| project name, resourceGroup, subscriptionId,
          allowBlobPublicAccess = tostring(properties.allowBlobPublicAccess),
          publicNetworkAccess = tostring(properties.publicNetworkAccess)
| order by allowBlobPublicAccess desc
```

## VMs por tamaño y sistema operativo

```kusto
resources
| where type =~ 'microsoft.compute/virtualmachines'
| project name, resourceGroup, subscriptionId, location,
          vmSize = tostring(properties.hardwareProfile.vmSize),
          os = tostring(properties.storageProfile.osDisk.osType)
| summarize cantidad = count() by vmSize, os
| order by cantidad desc
```

## Private endpoints por recurso destino

```kusto
resources
| where type =~ 'microsoft.network/privateendpoints'
| mv-expand conn = properties.privateLinkServiceConnections
| project name, resourceGroup, subscriptionId,
          destino = tostring(conn.properties.privateLinkServiceId),
          estado = tostring(conn.properties.privateLinkServiceConnectionState.status)
```
