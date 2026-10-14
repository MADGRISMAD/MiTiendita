# Respaldos y restauración

Un respaldo que nunca se ha restaurado no es un respaldo. Esta guía dice cómo hacerlos y cómo **probar** que sirven.

## 1. Hacer el respaldo (servidor con Docker)
`deploy/backup-mongo.sh` guarda un archivo `timber_AAAAMMDD_HHMMSS.archive` en `./backups` y conserva los últimos 14.

```bash
# Cada noche a las 3 am (crontab -e)
0 3 * * * cd /opt/timber && ./deploy/backup-mongo.sh >> backups/backup.log 2>&1
```

Variables opcionales: `BACKUP_DIR`, `MONGO_CONTAINER` (por omisión `hosstess-mongo-1`) y `DATABASE_NAME` (por omisión `timber`).

> Si la base está en **MongoDB Atlas** en lugar de Docker, usa los respaldos de Atlas (Backup → Cloud Backup con snapshots diarios) y prueba la restauración desde su panel hacia un clúster nuevo.

## 2. Copia fuera del servidor
Un respaldo en el mismo disco se pierde con el disco. Copia `./backups` a otro lugar al menos una vez al día (otro servidor, un bucket de almacenamiento o un disco externo), por ejemplo con `rclone` o `scp`.

## 3. Probar la restauración (hazlo una vez al mes)
`deploy/restore-mongo.sh` restaura en una base de prueba (`timber_restore_test`), sin tocar la real:

```bash
./deploy/restore-mongo.sh backups/timber_20261014_030000.archive
```

Al terminar imprime cuántos documentos tiene cada colección. Compáralos con la base real:
- `tenants`, `users`, `orders`, `foods`, `settings` deben tener números parecidos a los de producción.
- Si alguna sale en 0 o falta, el respaldo está incompleto: avisa antes de necesitarlo.

Después de la prueba puedes borrar la base de prueba: `docker exec <contenedor> mongosh --eval 'db.getSiblingDB("timber_restore_test").dropDatabase()'`.

## 4. Restaurar de verdad (emergencia)
```bash
TARGET_DB=timber ./deploy/restore-mongo.sh backups/timber_AAAAMMDD_HHMMSS.archive
```
Pide escribir `SI` porque **reemplaza** la base real. Detén el backend antes (`docker compose stop backend`) y vuélvelo a encender al terminar.

## 5. Bitácora de pruebas
| Fecha | Respaldo probado | Quién | Resultado |
|---|---|---|---|
| _pendiente_ | | | |
