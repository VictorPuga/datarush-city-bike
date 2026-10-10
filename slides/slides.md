---
theme: default
title: City Bike Rebalancer
info: Pitch DataRush City Bike
class: text-center
drawings:
  persist: false
transition: slide-left
comark: true
duration: 5min
---

<img class="cover-bg" src="/cover.jpeg" />
<div class="cover-overlay"></div>

<div class="cover-text">

# City Bike Rebalancer

## Cuántas bicis mover, a qué estación y cuándo

<div class="mt-12 text-sm">DataRush · Citi Bike NYC · Víctor Puga y Eduardo Porto</div>

</div>

<div class="credit credit-cover">Foto: Jer Rey, Pexels</div>

<!--
(0:00–0:10) Somos [equipo]. Les mostramos una herramienta para que operaciones de Citi Bike deje de reaccionar y empiece a planear.
-->

---

# Una estación vacía es un viaje que no ocurre

<div class="grid grid-cols-5 gap-8 mt-8 text-left items-center">
<div class="col-span-3">

<div class="grid grid-cols-2 gap-6">
<div class="card">

### Estación vacía
El usuario no puede **iniciar** su viaje.

</div>
<div class="card">

### Estación llena
El usuario no puede **terminarlo**.

</div>
</div>

<div class="mt-8">

Rebalancear cuesta vehículos, personal y tiempo.
Hoy es **reactivo**.
Queremos que sea **planeado**.

</div>
</div>
<div class="col-span-2 photo">
<img src="/photo.jpeg" />
<div class="credit">Foto: adam roye, Unsplash</div>
</div>
</div>

<!--
(0:10–0:35) La demanda no es uniforme: de mañana fluye de zonas residenciales a oficinas, de tarde al revés. Rebalancear es caro y hoy se hace reaccionando.
-->

---

# La decisión concreta

<div class="grid grid-cols-3 gap-6 mt-10 text-left">
<div class="card">

### Operaciones
**Cuántas** bicis mover a **qué estación** y **cuándo**.

</div>
<div class="card">

### Planeadores urbanos
Dónde ampliar o reubicar estaciones.

</div>
<div class="card">

### Usuarios
Una bici y un anclaje cuando los necesitan.

</div>
</div>

<!--
(0:35–0:50) Quién se beneficia y con qué decisión. Nivel estación-hora, porque ahí se opera.
-->

---

# Hallazgo con datos

<img src="/findings_tide_es.png" class="mt-2 mx-auto rounded-xl" style="max-height:285px" />

<div class="mt-2 text-left text-sm">

Octubre 2025 a septiembre 2026: **la demanda sigue una marea de commuting**.
A las 8 AM las estaciones de oficinas se llenan y las residenciales se vacían, y a las 5 PM ocurre lo contrario.
`9 Ave & W 33 St`: **+103** bicis netas en la mañana y **−104** en la tarde.
`W 43 St & 10 Ave`: **−72** en la mañana y **+49** en la tarde.

</div>

<div class="grid grid-cols-3 gap-6 mt-3">
<div class="card"><div class="big">766</div>estaciones ganan o pierden 5 bicis o más cada mañana</div>
<div class="card"><div class="big">97%</div>invierten el sentido en la tarde</div>
<div class="card"><div class="big">45.2 M</div>de viajes analizados, 72% en bici eléctrica</div>
</div>

<!--
(0:50–1:30) El momento de storytelling: una gráfica, un número, una conclusión.
Las estaciones se parten en dos grupos: las que pierden bicis entre 6 y 10 AM y las que las ganan.
El 97% invierte el sentido en la tarde, así que la mañana anticipa la tarde.
-->

---

# Qué explica la demanda: el clima

<img src="/findings_weather_es.png" class="mt-2 mx-auto rounded-xl" style="max-height:300px" />

<div class="mt-3 text-left text-sm">

- Lluvia ligera, moderada y fuerte: **−22%**, **−47%** y **−59%** de viajes, y el pico de la mañana cae más (−62% con lluvia moderada)
- Cada +10 °C: **+30%** de viajes, y **+48%** entre usuarios ocasionales contra **+27%** entre socios
- Con 11 a 50 mm de lluvia el perfil histórico se pasa hasta **4.5x** y el modelo hasta **1.5x**

</div>

<!--
(1:30–2:00) Otra causa de la demanda es el clima. Se compara cada hora con horas secas del mismo mes, tipo de día y hora.
Con lluvia moderada baja casi la mitad de la demanda.
El modelo sigue la caída, pero con tormentas muy fuertes todavía se pasa.
-->

---

# Datos y flujo reproducible

<div class="grid grid-cols-2 gap-6 mt-6 text-left">
<div class="card">

### Entradas
- Viajes Citi Bike: 12 CSV mensuales, oct 2025 a sep 2026
- 262 barrios NTA 2020 (NYC Open Data)
- Clima por hora (Open-Meteo) y festivos federales

</div>
<div class="card">

### Proceso
1. Limpieza: nulos, duración, coordenadas, estaciones de prueba y duplicados → **45.2 M viajes**
2. Tabla estación × 15 min: **2,515 estaciones**, 81 M de filas
3. `extract_stations.py` y `assign_regions.py` → estación → barrio NTA
4. Modelo exportado a ONNX y dashboard Next.js

</div>
</div>

<!--
(2:00–2:15) Todo reproducible desde los CSV crudos, con semilla fija.
-->

---

# Modelado

<table class="mt-4 w-full">
<thead><tr><th>Modelo</th><th>Error por estación-día</th><th>Error por estación-hora</th><th>Cobertura del IC 80% por estación-día</th></tr></thead>
<tbody>
<tr><td>Baseline: perfil histórico de la estación, ajustado al nivel reciente</td><td>33%</td><td>57%</td><td>—</td></tr>
<tr><td>Red neuronal v2 (Poisson)</td><td>26%</td><td>50%</td><td>63%</td></tr>
<tr><td><b>Modelo v3: red factorizada, binomial negativa</b></td><td><b>21%</b></td><td><b>47%</b></td><td><b>84%</b></td></tr>
</tbody>
</table>

<div class="mt-4 text-left text-sm">

- Tarea: salidas y llegadas por estación cada 15 min, clásicas y eléctricas
- **−37.5%** de error por estación-día y **−17.5%** por estación-hora contra el baseline
- Validación **temporal**: se entrena con el pasado y se prueba en las dos últimas semanas (17 a 30 sep), que no se usaron para elegir nada
- Entrenado con 12 meses, 2,515 estaciones y 81 M de filas; las estaciones nuevas se pronostican por barrio y coordenadas
- Sin lags: predice cualquier fecha con calendario y pronóstico de clima

</div>

<!--
(2:15–2:50) Baseline contra al menos un modelo más complejo, con validación temporal.
La mayor parte de la mejora viene de entrenar con 12 meses y no con 3; la arquitectura aporta el resto, más rapidez, estaciones nuevas e intervalos calibrados.
El error es la suma de errores absolutos entre la suma de salidas (WAPE), en el bloque de prueba.
-->

---

# Incertidumbre

<img src="/findings_trust_es.png" class="mt-2 mx-auto rounded-xl" style="max-height:270px" />

<div class="grid grid-cols-2 gap-6 mt-3 text-left text-sm">
<div class="card">

### Lo que mostramos
- Intervalo de 80% por estación y hora, calibrado: por día-estación cubre **84%** (con ruido Poisson: 63%)
- Las 924 estaciones más usadas (84% de los viajes) se pronostican con **19%** de error por día

</div>
<div class="card">

### Lo que no se ve
Los datos solo registran la demanda **satisfecha**.
Una estación vacía no genera viajes que contar.
En las 377 estaciones de menos de 5 salidas al día, el intervalo importa más que el punto.

</div>
</div>

<!--
(2:50–3:15) Un promedio que parece bueno puede fallar justo donde más importa.
Las estaciones grandes se planean con el punto y las chicas con el intervalo.
-->

---

# Demo: el dashboard

<img src="/dashboard.png" class="mt-4 mx-auto rounded-xl shadow-lg" style="max-height:230px" />

<div class="mt-4 text-left text-sm">

- Mapa por barrio, estaciones desde zoom 16
- Pronóstico de 24 horas por estación con intervalo de 80% calibrado
- Flujo neto: qué barrios ganan o pierden bicis en la siguiente hora
- El API ejecuta el modelo ONNX con `onnxruntime-node` y clima en vivo

</div>

<!--
(3:15–4:05) Demo en vivo: elegir fecha y hora, abrir un barrio, abrir una estación, mostrar el intervalo.
-->

---

# Una acción distinta por tipo de estación

<table class="mt-4 w-full text-sm">
<thead><tr><th>Tipo (estaciones)</th><th>Qué se mide</th><th>Acción</th></tr></thead>
<tbody>
<tr><td>Origen de commuting (460)</td><td>−14 bicis netas de 6 a 10 AM y +9 en la tarde</td><td>Reponer antes de las 6 AM</td></tr>
<tr><td>Destino de oficinas (306)</td><td>+20 bicis netas en la mañana; 32% menos demanda en fin de semana</td><td>Retirar antes de las 10 AM, solo en días laborables</td></tr>
<tr><td>Ocio (78)</td><td>29% más demanda en fin de semana; 25% de viajes ocasionales</td><td>Reforzar el viernes por la tarde y el fin de semana</td></tr>
<tr><td>Equilibradas (843)</td><td>Balance neto cercano a cero</td><td>Sin ruta programada; vigilar el intervalo</td></tr>
<tr><td>Baja demanda (650)</td><td>Menos de 10 salidas por día laborable</td><td>No planear con el punto; usar el intervalo</td></tr>
</tbody>
</table>

<div class="mt-4 text-sm">Con lluvia moderada baja la demanda 47%: la reposición se ajusta al pronóstico.</div>
<div class="mt-2 text-sm opacity-60">Tipos medidos con 12 meses de viajes; umbrales redondos, sin ajustar a ninguna métrica.</div>

<!--
(4:05–4:40) Qué explica la demanda y qué hacer en cada caso: hora y tipo de estación, tipo de usuario y clima.
El 38% de los viajes laborables sale de estaciones de origen y el 32% de destinos de oficinas.
-->

---

# Siguiente paso

<div class="grid grid-cols-3 gap-6 mt-10 text-left">
<div class="card">

### Un segundo año
Separar la tendencia de la estacionalidad: hoy el modelo se queda corto en días fríos y se pasa en tormentas.

</div>
<div class="card">

### Tiempo real
Inventario con GBFS: medir el stock y no solo el flujo.

</div>
<div class="card">

### Rutas de rebalanceo
Optimizar camiones y turnos.

</div>
</div>

<div class="mt-10 text-xl font-semibold">Pasar de reaccionar a planear.</div>

<!--
(4:40–5:00) Cierre conciso. Repetir el mensaje.
-->
