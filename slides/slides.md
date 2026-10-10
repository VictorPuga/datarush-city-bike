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
(0:00–0:15) Somos [equipo]. Les mostramos una herramienta para que operaciones de Citi Bike deje de reaccionar y empiece a planear.
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
(0:15–0:45) La demanda no es uniforme: de mañana fluye de zonas residenciales a oficinas, de tarde al revés. Rebalancear es caro y hoy se hace reaccionando.
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
(0:45–1:05) Quién se beneficia y con qué decisión. Nivel estación-hora, porque ahí se opera.
-->

---

# Hallazgo con datos

<div class="mt-8 text-left">

Julio a septiembre 2026: **la demanda se concentra en dos picos y la mayoría de los viajes son en bici eléctrica**.
A las 8 AM las estaciones de oficinas se llenan y las residenciales se vacían, y a las 5 PM ocurre lo contrario.

- `9 Ave & W 33 St`: **+125** bicis netas en la mañana y **−119** en la tarde
- `W 43 St & 10 Ave`: **−68** en la mañana y **+48** en la tarde

</div>

<div class="grid grid-cols-3 gap-6 mt-8">
<div class="card"><div class="big">15.2 M</div>viajes analizados</div>
<div class="card"><div class="big">5 PM</div>hora pico en días laborables (8 AM es el segundo pico)</div>
<div class="card"><div class="big">73%</div>de viajes en bici eléctrica</div>
</div>

<!--
(1:05–1:50) El momento de storytelling: una gráfica, un número, una conclusión.
-->

---

# Datos y flujo reproducible

<div class="grid grid-cols-2 gap-6 mt-6 text-left">
<div class="card">

### Entradas
- Viajes Citi Bike (CSV mensuales)
- 262 barrios NTA 2020 (NYC Open Data)
- Clima y calendario (siguiente paso)

</div>
<div class="card">

### Proceso
1. `extract_stations.py` → **2,393 estaciones**
2. `assign_regions.py` → estación → NTA
3. Esquemas pre/post feb-2021 armonizados: Subscriber = member, Customer = casual
4. Dashboard Next.js

</div>
</div>

<!--
(1:50–2:15) Todo con Python estándar, reproducible desde los CSV crudos.
-->

---

# Modelado

<table class="mt-6 w-full">
<thead><tr><th>Modelo</th><th>MAE</th><th>RMSE</th><th>Cobertura IC 80%</th></tr></thead>
<tbody>
<tr><td>Baseline: promedio estación·día·slot de 15 min</td><td>0.584</td><td>1.165</td><td>—</td></tr>
<tr><td>Red neuronal PyTorch (Poisson, embeddings por estación)</td><td>0.515</td><td>1.049</td><td>±1.28√λ (ruido Poisson)</td></tr>
</tbody>
</table>

<div class="mt-6 text-left">

- Tarea: salidas y llegadas por estación cada 15 min, clásicas y eléctricas
- Métricas sobre salidas totales en test (17–30 sep): **−11.9% MAE**, **−9.9% RMSE** y **−48% devianza de Poisson** vs. el baseline
- Entrenado con 2,461 estaciones y 20.9 M de filas
- Validación **temporal**: entrenar en el pasado, probar en el futuro, sin fuga
- Sin lags: predice cualquier fecha con calendario y pronóstico de clima (Open-Meteo)

</div>

<!--
(2:15–2:55) Baseline contra al menos un modelo más complejo, con validación temporal.
-->

---

# Incertidumbre

<div class="grid grid-cols-2 gap-6 mt-8 text-left">
<div class="card">

### Lo que mostramos
- Intervalo de predicción por estación y hora
- Error por estación, hora y tipo de día

</div>
<div class="card">

### Lo que no se ve
Los datos solo registran la demanda **satisfecha**.
Una estación vacía no genera viajes que contar.

</div>
</div>

<!--
(2:55–3:20) Un promedio que parece bueno puede fallar justo donde más importa.
-->

---

# Demo: el dashboard

<img src="/dashboard.png" class="mt-4 mx-auto rounded-xl shadow-lg" style="max-height:230px" />

<div class="mt-4 text-left text-sm">

- Mapa por barrio, estaciones desde zoom 16
- Pronóstico de 24 horas por estación con banda de confianza
- Flujo neto: qué barrios ganan o pierden bicis en la siguiente hora
- El API ejecuta el modelo ONNX con `onnxruntime-node` y clima en vivo

</div>

<!--
(3:20–4:10) Demo en vivo: elegir fecha y hora, abrir un barrio, abrir una estación, mostrar el intervalo.
-->

---

# Una acción distinta por tipo de estación

<table class="mt-6 w-full">
<thead><tr><th>Patrón</th><th>Causa probable</th><th>Acción</th></tr></thead>
<tbody>
<tr><td>Se vacía por la mañana</td><td>Origen de commuting</td><td>Reponer antes de la hora pico</td></tr>
<tr><td>Se llena por la mañana</td><td>Destino de oficinas</td><td>Retirar antes de la hora pico</td></tr>
<tr><td>Picos en fin de semana</td><td>Turismo, recreación</td><td>Reforzar viernes por la tarde</td></tr>
<tr><td>Caída con lluvia o frío</td><td>Clima</td><td>Reducir reposición</td></tr>
</tbody>
</table>

<div class="mt-4 text-sm opacity-60">Hipótesis a confirmar con el modelo.</div>

<!--
(4:10–4:40) Qué explica la demanda y qué hacer en cada caso.
-->

---

# Siguiente paso

<div class="grid grid-cols-3 gap-6 mt-10 text-left">
<div class="card">

### Reentrenar
Más meses de datos y confirmar festivos y unidades del clima con el modelo.

</div>
<div class="card">

### Tiempo real
Inventario con GBFS y clima.

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
