# Documentacion General del Bot (Fase Beta)

## 1. Nombre del proyecto
TulaBot / EyedBot (Bot de Discord)

## 2. Descripcion breve
TulaBot es un bot de Discord orientado a la gestion de comunidades. Incluye comandos de moderacion, musica, entretenimiento, utilidades y configuraciones por servidor. Tambien integra funciones de IA y un panel web de administracion.

## 3. Estado del proyecto
**Estado actual: BETA**

Este bot se encuentra en fase beta. Durante esta etapa pueden presentarse:
- Fallas puntuales en comandos o respuestas.
- Demoras en la ejecucion de acciones.
- Comportamientos inestables bajo carga alta o en ciertos servidores.
- Cambios frecuentes en funciones y configuraciones.

Se recomienda usarlo con monitoreo y reportar errores para mejorar la estabilidad.

## 4. Lenguajes y tecnologias utilizadas
### Lenguaje principal
- JavaScript (Node.js)

### Tecnologias y librerias clave
- discord.js (interaccion con API de Discord)
- discord-player + @discordjs/voice (sistema de musica)
- Express.js (panel web y endpoints)
- MySQL (persistencia de datos)
- Docker y Docker Compose (despliegue y contenedores)
- Google Gemini API (funciones de IA)

### Otros componentes
- HTML, CSS y JavaScript para frontend del panel web.
- JSON para configuraciones y datos auxiliares.

## 5. Funciones principales del bot
### Moderacion
- Gestion de usuarios (ban, kick, mute, unmute).
- Sistema de advertencias (warn, warnings, clearwarns).
- Control de canales (lock, unlock, slowmode).
- Limpieza de mensajes y anuncios.

### Musica
- Reproduccion de audio en canales de voz.
- Cola de canciones y control de reproduccion.
- Funciones como pausa, reanudar, loop, filtros, autoplay y seek.

### Entretenimiento
- Comandos de diversion (memes, gif, trivia, encuestas, acciones sociales).
- Comandos informativos de usuario y servidor.

### Utilidades y administracion
- Comandos de configuracion del servidor.
- Sistema de bienvenida y respuestas automaticas.
- Modulos de verificacion, tickets y voz temporal.
- Registro de eventos y herramientas de mantenimiento.

### IA
- Comandos para conversacion con modelos Gemini.
- Gestion de contexto e historial de conversacion.

### Panel web
- Autenticacion con Discord (OAuth2).
- Gestion administrativa y visualizacion de informacion del bot.

## 6. Estructura general del sistema
- `src/commands/`: comandos por categoria.
- `src/events/`: eventos del bot en Discord.
- `src/utils/`: utilidades (base de datos, logs, configuraciones).
- `web/`: panel web (backend y frontend).
- `docker/`: archivos de soporte para despliegue y base de datos.

## 7. Alcance y advertencias para usuarios
- El bot esta pensado para servidores de Discord que requieren moderacion y herramientas de comunidad.
- Algunas funciones dependen de permisos de Discord y servicios externos.
- En fase beta, la disponibilidad y tiempos de respuesta pueden variar.

## 8. Nota de uso recomendada
Antes de un uso en produccion, se recomienda:
- Probar comandos en un servidor de testing.
- Verificar permisos del bot y configuraciones iniciales.
- Revisar logs periodicamente.
- Mantener dependencias y configuraciones actualizadas.

## 9. Contacto y soporte
Para soporte tecnico o reporte de errores, usar el canal definido por el administrador del proyecto.
